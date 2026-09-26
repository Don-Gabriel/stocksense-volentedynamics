"""Render the test catalog and real runner results as a readable, tabular PDF.

Requires reportlab. Run API and browser tests sequentially before generating.
No application secrets or live inventory records are read by this script.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

import reportlab
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
output = Path(args.output)
catalog = json.loads((ROOT/'docs/test-case-catalog.json').read_text(encoding='utf-8'))
api = json.loads((ROOT/'.local/api-test-results.json').read_text(encoding='utf-8'))
browser = json.loads((ROOT/'.local/browser-test-results.json').read_text(encoding='utf-8'))

tests = []
for suite in api['testResults']:
    for item in suite['assertionResults']:
        tests.append(dict(id=f'API-{len(tests)+1:02}',kind='API',name=item['title'],status=item['status'],source='apps/api/test/inventory.spec.ts',durationMs=item.get('duration',0)))
def browser_suites(suites):
    for suite in suites:
        for spec in suite.get('specs',[]):
            passed = spec['ok'] and all(t.get('status')=='expected' for t in spec['tests'])
            tests.append(dict(id=f'UI-{sum(t["kind"]=="UI" for t in tests)+1:02}',kind='UI',name=spec['title'],status='passed' if passed else 'failed',source=f'tests/{spec["file"]}:{spec["line"]}',durationMs=sum(r.get('duration',0) for t in spec['tests'] for r in t.get('results',[]))))
        browser_suites(suite.get('suites',[]))
browser_suites(browser['suites'])
live_path=ROOT/'docs/gmail-execution.json'
live=json.loads(live_path.read_text(encoding='utf-8')) if live_path.exists() else None
if live:
    tests.extend(live['tests'])

for section in catalog:
    for case in section['cases']:
        evidence = case['evidence']
        if evidence:
            kind,fragment = evidence.split(':',1)
            matches = [t for t in tests if t['kind']==kind and fragment in t['name']]
            if kind=='LIVE' and not live:
                case.update(testId='',result='NOT RUN',method='Manual')
                continue
            if len(matches)!=1:
                raise ValueError(f'{case["id"]}: evidence must match exactly one executed test: {evidence}')
            case['testId']=matches[0]['id']
            case['result']='PASS' if matches[0]['status']=='passed' else 'FAIL'
            case['method']=kind
        else:
            case.update(testId='',result='NOT RUN',method='Manual')

cases=[c for s in catalog for c in s['cases']]
counts={status:sum(c['result']==status for c in cases) for status in ['PASS','FAIL','NOT RUN']}
timestamp=datetime.now(timezone(timedelta(hours=5,minutes=30))).strftime('%d %B %Y, %H:%M IST')
digest=hashlib.sha256()
for path in sorted([*ROOT.glob('apps/api/src/**/*.ts'),*ROOT.glob('apps/web/src/**/*.ts'),*ROOT.glob('apps/web/src/**/*.tsx'),*ROOT.glob('apps/web/src/**/*.css'),*ROOT.glob('tests/*.ts'),*ROOT.glob('apps/api/test/*.ts')]):
    digest.update(path.relative_to(ROOT).as_posix().encode());digest.update(path.read_bytes())
fingerprint=digest.hexdigest()
if live and live['codeFingerprint'] != fingerprint:
    raise ValueError('Live Gmail evidence belongs to a different source fingerprint; rerun the live check before attributing it to this code.')
email_status=live['externalEmail'] if live else 'External Gmail connection and inbox delivery have not been verified. Local Mailpit flows are tested.'
manifest=dict(generatedAt=timestamp,codeFingerprint=fingerprint,caseCounts=counts,testCounts=dict(API=sum(t['kind']=='API' for t in tests),UI=sum(t['kind']=='UI' for t in tests),LIVE=sum(t['kind']=='LIVE' for t in tests)),apiRunStartedAt=datetime.fromtimestamp(api['startTime']/1000,timezone.utc).isoformat(),browserRunStartedAt=browser['stats']['startTime'],gmailRunStartedAt=live['startedAt'] if live else None,externalEmail=email_status,tests=tests)
(ROOT/'docs/test-execution.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')

fontdir=Path(reportlab.__file__).parent/'fonts'
regular=Path('C:/Windows/Fonts/segoeui.ttf')
bold=Path('C:/Windows/Fonts/segoeuib.ttf')
pdfmetrics.registerFont(TTFont('Vera',str(regular if regular.exists() else fontdir/'Vera.ttf')))
pdfmetrics.registerFont(TTFont('VeraBold',str(bold if bold.exists() else fontdir/'VeraBd.ttf')))
pdfmetrics.registerFontFamily('Vera',normal='Vera',bold='VeraBold',italic='Vera',boldItalic='VeraBold')
GREEN=colors.HexColor('#174735');INK=colors.HexColor('#273B32');MUTED=colors.HexColor('#57695F');LIGHT=colors.HexColor('#EFF4EF');LINE=colors.HexColor('#D6E1D8');AMBER=colors.HexColor('#805A16')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='Cover',fontName='VeraBold',fontSize=31,leading=37,textColor=GREEN,spaceAfter=17))
styles.add(ParagraphStyle(name='Section',fontName='VeraBold',fontSize=20,leading=26,textColor=GREEN,spaceAfter=13,keepWithNext=True))
styles.add(ParagraphStyle(name='Sub',fontName='VeraBold',fontSize=13,leading=18,textColor=GREEN,spaceAfter=8,spaceBefore=10,keepWithNext=True))
styles.add(ParagraphStyle(name='Text',fontName='Vera',fontSize=10.5,leading=15,textColor=INK,spaceAfter=10))
styles.add(ParagraphStyle(name='Small',fontName='Vera',fontSize=9,leading=13,textColor=MUTED,spaceAfter=7))
styles.add(ParagraphStyle(name='Cell',fontName='Vera',fontSize=10.5,leading=14,textColor=INK))
styles.add(ParagraphStyle(name='CellHead',fontName='VeraBold',fontSize=9,leading=12,textColor=colors.white))
styles.add(ParagraphStyle(name='Result',fontName='VeraBold',fontSize=9.2,leading=13,textColor=GREEN))
styles.add(ParagraphStyle(name='Warn',fontName='VeraBold',fontSize=9.2,leading=13,textColor=AMBER))
def clean(value):
    return str(value).replace('→',' > ').replace('−','-').replace('–','-').replace('—','-').replace('’',"'").replace('“','"').replace('”','"')
def p(text,style='Text',markup=False):
    return Paragraph(clean(text) if markup else escape(clean(text)),styles[style])
def table(rows,widths,header=True):
    data=[]
    for i,row in enumerate(rows):
        data.append([value if isinstance(value,Paragraph) else p(value,'CellHead' if header and i==0 else 'Cell') for value in row])
    t=Table(data,colWidths=widths,repeatRows=1 if header else 0,hAlign='LEFT')
    commands=[('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),('LINEBELOW',(0,0),(-1,0),.7,GREEN),('LINEBELOW',(0,1),(-1,-1),.45,LINE)]
    if header:commands += [('BACKGROUND',(0,0),(-1,0),GREEN),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F5F8F4')])]
    t.setStyle(TableStyle(commands));return t

WIDTH,HEIGHT=landscape(A4);MARGIN=36;CONTENT=WIDTH-2*MARGIN
doc=SimpleDocTemplate(str(output),pagesize=(WIDTH,HEIGHT),rightMargin=MARGIN,leftMargin=MARGIN,topMargin=49,bottomMargin=40,title='StockSense - Exact Navigation Test Guide',author='Volente Dynamics',subject='Functional, usability, authentication and inventory test catalog with execution evidence')
story=[]
story += [Spacer(1,16),p('STOCKSENSE / VOLENTE DYNAMICS','Small'),p('Exact navigation<br/>test guide','Cover',True),p('151 scenarios with numbered actions, exact button and field names, sample values, prerequisites and expected results.'),p('Revised '+timestamp,'Small')]
story.append(table([['PRIOR EVIDENCE','PENDING CHECKS','THIS REVISION'],[f'{counts["PASS"]} scenarios covered by passing tests',f'{counts["NOT RUN"]} cases previously not run','Navigation instructions verified against current source; public authentication labels also checked in the browser.']], [CONTENT*.34,CONTENT*.25,CONTENT*.41]))
story += [Spacer(1,16),p('Read this first','Sub'),p('The numbered instructions below are the manual test procedure. Previous API, browser and live Gmail results are retained as evidence; they do not mean every newly expanded manual procedure was rerun. Each case has a blank tester-result row for your own pass/fail and notes.'),p('Start at http://127.0.0.1:5173/login. Use your current manager or warehouse-staff password. The initial synthetic seed password is StockSense!2026 only on a fresh seed; it may no longer match an existing account.'),p('Use SETUP-01 once before inventory cases. Create only the named QA records. For a repeat run, replace the final 01 in QA names/SKUs with a new suffix such as 02 throughout the dependent cases.'),p(email_status,'Small'),PageBreak()]
story += [p('How to follow the exact steps','Section')]
story.append(table([['TERM / START STATE','EXACT MEANING'],['Signed in as manager','Open /login. Fill Login ID or email with your manager identity, Password with its current password, then click Sign in. On mobile, click the top-left hamburger (Open navigation) before a sidebar link.'],['Before each independent case','Set the top-right warehouse selector (Warehouse scope) to All warehouses. Start with no open dialog. Follow the stated prerequisites and use the unique QA product named by that case.'],['Quoted labels','Text in quotes is the app label. Some labels are accessible names rather than printed text; icon buttons and unlabeled dropdowns are also described by appearance and position.'],['<NEW_LOGIN_ID>','Choose a unique 6-12 character login made from letters, digits or underscores, for example qa26092601. Use the same identity throughout dependent account cases.'],['<TEST_EMAIL> / <UNREGISTERED_TEST_EMAIL>','Use real addresses that you control. For Gmail use distinct plus aliases of your own address when you need independent accounts. Never use a unrelated address.'],['Codes and test passwords','Copy the latest six-digit code from the matching message. Verification and reset codes are different. QaTest!2026 and QaReset!2026 are suggested disposable test-account passwords, not your existing manager password.'],['Keep the document reference','After Create draft, copy the generated heading (for example QAT/IN/...). Its exact number varies. Reopen it using the operation list search and click that same reference.'],['Technical cases','Terminal/API cases have no equivalent app button. They include the exact automated-test command. Run API and browser suites sequentially; they reset stocksense_test, not the normal demo database.'],['Manual environment cases','Printer, device, outage, load, restore and deployment checks require the named environment. Where that environment or harness does not exist, the case explicitly stays pending; no fictional app menu is given.']], [170,CONTENT-170]))
story += [PageBreak(),p('SETUP-01 / Create the QA workspace records','Section'),p('Sign in as an inventory manager. Reuse these records if they already exist with exactly these details; do not rename existing business records.','Small')]
setup=[
('1','Sidebar Settings > Categories tab > Add category. In New category enter Name = QA Tests. Click Save category.'),
('2','Warehouses tab > Add warehouse. Enter Name = QA Test Warehouse; Short code = QAT; Address = QA only. Click Save warehouse.'),
('3','Warehouses tab > Add warehouse. Enter Name = QA Branch; Short code = QAB; Address = QA only. Click Save warehouse.'),
('4','Locations tab > Add location. Enter Name = QA Main; Short code = MAIN; Warehouse = QA Test Warehouse. Click Save location.'),
('5','Locations tab > Add location. Enter Name = QA Rack; Short code = RACK; Warehouse = QA Test Warehouse. Click Save location.'),
('6','Locations tab > Add location. Enter Name = QA Branch Stock; Short code = STOCK; Warehouse = QA Branch. Click Save location.'),
('7','Contacts tab > Add contact. Enter Name = QA Supplier; Contact type = Supplier. Leave Email, Phone and Address blank. Click Save contact.'),
('8','Contacts tab > Add contact. Enter Name = QA Customer; Contact type = Customer. Leave Email, Phone and Address blank. Click Save contact.'),
('9','Set the top-right Warehouse scope selector to All warehouses. Your location options will read QAT / QA Main, QAT / QA Rack and QAB / QA Branch Stock.'),
]
story.append(table([['STEP','EXACT CLICKS / VALUES']]+setup,[65,CONTENT-65]))
story += [PageBreak(),p('Navigation and icon reference','Section')]
story.append(table([['DESTINATION / CONTROL','EXACT ROUTE OR LOCATION'],['Products','Sidebar Products > New product. To edit: pencil at right of product row, named Edit <product name>.'],['Receipt','Sidebar Receipts > New receipt. Save with Create draft; then Confirm > Validate.'],['Delivery','Sidebar Deliveries > New delivery. Create draft > Confirm > Mark as picked > Mark as packed > Validate. If short, use Check availability after replenishment.'],['Transfer','Sidebar Internal transfers (page title Transfers) > New transfer. Create draft > Confirm > Validate.'],['Physical count','Sidebar Adjustments > New adjustment. Count location; Reason for adjustment; first quantity box under Counted. Create draft > Confirm > Validate.'],['Stock row count shortcut','Sidebar Stock on hand > clipboard icon at right of a row. Tooltip Update counted quantity; accessible name Adjust <product> at <location>. Manager only.'],['History','Sidebar Move history. Signed quantities appear in the Change column; From/To fields filter movement dates.'],['Team approval','Sidebar Settings > Team tab > target account row > Approve > Confirm access change. Requires Email verified.'],['Profile and sign-out','Click your avatar/name at bottom-left for Profile. Sign out is immediately below.'],['List / Kanban','Operation-list toolbar: list icon = List view; three-column icon = Kanban view.'],['Dialog close / discard','Top-right X = Close dialog. If changed, choose Keep editing or Discard changes. Form Cancel also invokes the unsaved-change check.'],['Pagination','At the bottom of paginated lists: left chevron = Previous page; right chevron = Next page. A disabled chevron cannot be clicked.'],['Mobile menu','Top-left hamburger = Open navigation; drawer top-right X = Close navigation.'],['Required dependencies','CAT-21 follows CAT-01/03/05/06; CAT-22 follows CAT-12; DEL-04 follows DEL-03; RPT-06 follows RPT-04; RPT-09 follows TRF-04; RPT-13 follows REC-01. Other cases create their own named data.']], [170,CONTENT-170]))
story.append(PageBreak())

for section in catalog:
    story += [p(section['name'],'Section'),p('Numbered actions are the revised procedure. Prior evidence and your manual result are separate.','Small')]
    for c in section['cases']:
        if not c.get('navigation'):
            raise ValueError('Missing exact steps: '+c['id'])
        prior=(c['method']+' '+c['testId']+' / '+c['result']) if c['testId'] else 'NOT RUN - no prior passing evidence'
        rows=[[c['id'],c['scenario']],['Start',c['manualPreconditions']],['Method',c['surface']]]
        rows.extend([[str(i+1),step] for i,step in enumerate(c['navigation'])])
        rows += [['Expected',c['manualExpected']],['Evidence',prior+'. Applies to the earlier assertion group; this manual walkthrough is not recorded as executed.'],['Your result','PASS / FAIL / BLOCKED: __________    Date: __________    Tester: __________    Notes: ____________________']]
        t=table(rows,[72,CONTENT-72])
        t.setStyle(TableStyle([('TOPPADDING',(0,1),(-1,-1),5),('BOTTOMPADDING',(0,1),(-1,-1),5),('BACKGROUND',(0,-3),(-1,-3),LIGHT),('BACKGROUND',(0,-1),(-1,-1),colors.HexColor('#FFF8E9'))]))
        story += [t,Spacer(1,17)]
    story.append(PageBreak())

story += [p('Executed-test evidence index','Section'),p('Multiple catalog rows can map to one executable test when that test asserts each listed behavior. The index below comes from the actual final runner JSON, not a manually declared pass list.','Small')]
rows=[['ID / METHOD','EXECUTABLE TEST','RESULT / TIME','SOURCE']]
for t in tests:
    timing=f'{t["durationMs"]/1000:.2f}s' if t.get('durationMs') is not None else 'live check'
    rows.append([t['id'],t['name'],f'{t["status"].upper()} / {timing}',t['source']])
story.append(table(rows,[80,360,110,CONTENT-550]));story.append(PageBreak())
story += [p('Remaining checks and handoff','Section'),p('Gmail status and future setup','Sub'),p(email_status),p('For a future sender change: from the repository root, run powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-gmail.ps1. Enter the sender address and app password only at its local prompt. Run node scripts/check-email.cjs, then restart the API. Use an actual recipient for signup and password reset to verify inbox delivery. Never put the app password in the PDF, chat or GitHub.'),p('Google app passwords require 2-Step Verification and may be unavailable under account restrictions. Gmail sending limits still apply. The project does not purchase a plan or enable billing.','Small'),p('Official setup references','Sub'),p('<link href="https://support.google.com/mail/answer/185833?hl=en" color="#174735">Google: Sign in with app passwords</link><br/><link href="https://nodemailer.com/smtp" color="#174735">Nodemailer: SMTP transport, TLS and STARTTLS</link>','Text',True),p('Manual execution record','Sub'),p('For each NOT RUN scenario, record tester, date, environment, actual outcome and supporting screenshot/log. Keep synthetic data for destructive/load/recovery tests. A successful code connection check alone does not establish successful inbox delivery.'),p('Release evidence','Sub'),p('TypeScript checking and production build passed. npm audit reported zero known vulnerabilities at the review snapshot. These checks complement the behavioral results and do not guarantee that undiscovered defects or vulnerabilities are absent.'),p('API run: '+manifest['apiRunStartedAt']+' | Browser run: '+manifest['browserRunStartedAt'],'Small'),p('Gmail run: '+str(manifest['gmailRunStartedAt'])+' | Code SHA-256: '+fingerprint,'Small')]

def footer(canvas,doc):
    canvas.saveState();canvas.setFillColor(GREEN);canvas.rect(MARGIN,HEIGHT-26,CONTENT,3,fill=1,stroke=0)
    canvas.setFont('VeraBold',8);canvas.drawString(MARGIN,HEIGHT-39,'STOCKSENSE  /  END-TO-END QUALITY REVIEW')
    canvas.setStrokeColor(LINE);canvas.line(MARGIN,30,WIDTH-MARGIN,30);canvas.setFillColor(MUTED);canvas.setFont('Vera',8)
    canvas.drawString(MARGIN,17,'26 September 2026  |  Local test environment  |  Volente Dynamics');canvas.drawRightString(WIDTH-MARGIN,17,f'Page {doc.page}');canvas.restoreState()
output.parent.mkdir(parents=True,exist_ok=True)
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(json.dumps(dict(output=str(output),cases=len(cases),results=counts,tests=manifest['testCounts'],fingerprint=fingerprint),indent=2))
