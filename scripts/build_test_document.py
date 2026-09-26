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

for section in catalog:
    for case in section['cases']:
        evidence = case['evidence']
        if evidence:
            kind,fragment = evidence.split(':',1)
            matches = [t for t in tests if t['kind']==kind and fragment in t['name']]
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
manifest=dict(generatedAt=timestamp,codeFingerprint=fingerprint,caseCounts=counts,testCounts=dict(API=sum(t['kind']=='API' for t in tests),UI=sum(t['kind']=='UI' for t in tests)),apiRunStartedAt=datetime.fromtimestamp(api['startTime']/1000,timezone.utc).isoformat(),browserRunStartedAt=browser['stats']['startTime'],externalEmail='Not configured or externally verified at this review',tests=tests)
(ROOT/'docs/test-execution.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')

fontdir=Path(reportlab.__file__).parent/'fonts'
pdfmetrics.registerFont(TTFont('Vera',str(fontdir/'Vera.ttf')))
pdfmetrics.registerFont(TTFont('VeraBold',str(fontdir/'VeraBd.ttf')))
pdfmetrics.registerFontFamily('Vera',normal='Vera',bold='VeraBold',italic='Vera',boldItalic='VeraBold')
GREEN=colors.HexColor('#174735');INK=colors.HexColor('#273B32');MUTED=colors.HexColor('#57695F');LIGHT=colors.HexColor('#EFF4EF');LINE=colors.HexColor('#D6E1D8');AMBER=colors.HexColor('#805A16')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='Cover',fontName='VeraBold',fontSize=31,leading=37,textColor=GREEN,spaceAfter=17))
styles.add(ParagraphStyle(name='Section',fontName='VeraBold',fontSize=20,leading=26,textColor=GREEN,spaceAfter=13,keepWithNext=True))
styles.add(ParagraphStyle(name='Sub',fontName='VeraBold',fontSize=13,leading=18,textColor=GREEN,spaceAfter=8,spaceBefore=10,keepWithNext=True))
styles.add(ParagraphStyle(name='Text',fontName='Vera',fontSize=10.5,leading=15,textColor=INK,spaceAfter=10))
styles.add(ParagraphStyle(name='Small',fontName='Vera',fontSize=9,leading=13,textColor=MUTED,spaceAfter=7))
styles.add(ParagraphStyle(name='Cell',fontName='Vera',fontSize=9.2,leading=12.7,textColor=INK))
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
doc=SimpleDocTemplate(str(output),pagesize=(WIDTH,HEIGHT),rightMargin=MARGIN,leftMargin=MARGIN,topMargin=49,bottomMargin=40,title='StockSense - End-to-End Test Cases and Execution Review',author='Volente Dynamics',subject='Functional, usability, authentication and inventory test catalog with execution evidence')
story=[]
story += [Spacer(1,20),p('STOCKSENSE / VOLENTE DYNAMICS','Small'),p('End-to-end test cases<br/>and execution review','Cover',True),p('From signup and email verification to inventory posting, reservations, warehouse transfers, physical counts and movement history.'),Spacer(1,12)]
story.append(table([['CATALOG','EXECUTED SCENARIOS','PENDING MANUAL CHECKS','AUTOMATED TESTS'],[f'{len(cases)} scenarios',f'{counts["PASS"]} pass / {counts["FAIL"]} fail',str(counts['NOT RUN']),f'{manifest["testCounts"]["API"]} API + {manifest["testCounts"]["UI"]} browser']], [CONTENT*.24,CONTENT*.27,CONTENT*.25,CONTENT*.24]))
story += [Spacer(1,20),p('Prepared '+timestamp),p('Real email status','Sub'),p('Gmail SMTP support is implemented. External connection and inbox delivery have not been verified because the owner has not configured the sender app password. Local Mailpit verification and reset flows are tested.'),p('Interpretation','Sub'),p('PASS applies to the cited automated assertion group. API evidence validates server behavior; UI evidence exercises the browser. NOT RUN is an explicit manual checklist item, not an implied pass. This is broad risk-based coverage, not a proof that every possible input and environment has been exhausted.'),p('Source fingerprint: '+fingerprint[:24]+'...','Small'),PageBreak()]

story += [p('How to run and read this document','Section')]
story.append(table([['AREA','TEST ENVIRONMENT / RULE'],['Isolation','Windows; real local PostgreSQL on 127.0.0.1:55432, database stocksense_test only. Tests reject other host/port/database combinations. Run API tests and browser tests sequentially.'],['Browser','Chromium through Playwright. Isolated test API port 3002 and frontend 5174. Responsive checks at 390, 768 and 1280px; desktop search at 1440px.'],['Email','Mailpit SMTP 1025 / inbox 8025. Automated tests force MAIL_MODE=local so Gmail is never used by the suites.'],['Test accounts','Fresh browser seed: manager / StockSense!2026 and warehouse / StockSense!2026. These are synthetic test credentials. Existing demo accounts may have different passwords; tests do not reset them.'],['Baseline data','Seeded Central Warehouse and South Store; storage locations, product categories, supplier Atlas Metals and customer Aurora Interiors. Tests create uniquely named extra records in the disposable test DB.'],['Commands','npm run typecheck; npm run build; npm run test -w @stocksense/api -- --json --outputFile=../../.local/api-test-results.json; npm run test:e2e. API and UI test commands must run sequentially.'],['Reports','API JSON: .local/api-test-results.json; browser JSON: .local/browser-test-results.json; browser HTML: playwright-report/index.html. Public compact evidence: docs/test-execution.json.'],['Rebuild this PDF','Run node scripts/test-case-catalog.cjs, then Python scripts/build_test_document.py --output <target.pdf> with ReportLab installed. The renderer refuses unmatched test evidence.']], [130,CONTENT-130]))
story.append(PageBreak())

story += [p('Review decisions and coverage limits','Section')]
story.append(table([['REVIEW FINDING','IMPLEMENTED CORRECTION'],['Readability and navigation','Self-hosted Inter, larger primary text/controls, darker secondary text, fixed sidebar/account controls, linked breadcrumbs, All operations entry, keyboard/mobile navigation.'],['Unstable filtering and lost context','Retain previous list results during refresh; show progress; persist Kanban and list-return filters; retain warehouse scope. Detail records do not display another record as placeholder data.'],['Accidental loss of work','Discard/keep-editing warning, unsaved-form unload protection, retained inputs after failed save and safe retry.'],['Open signup access','Pending staff account without a session; email verification plus manager approval. Manager-only role/status changes revoke prior sessions.'],['Codes and email transport','Purpose/user-bound HMAC, expiry, five-attempt limit, single use, resend cooldown, rate limits, TLS SMTP and sanitized failures.'],['Inventory consistency','Serializable transactions, all-or-none reservations, pick/pack before dispatch, immutable completed documents, signed transfer ledger, stale-count rejection, rollback and balance reconciliation.']], [170,CONTENT-170]))
story += [Spacer(1,13),p('Not a production certification','Sub'),p('One shared workspace; two roles, many accounts. No tenant isolation, warehouse-specific permissions, partial delivery/backorders, lots/serials, accounting, invoices, payments or production backup scheduling. Database administrators can alter the database directly. Auth throttles are process-local. Real-device, screen-reader, alternate-browser, load/soak and backup-restore checks below are pending.'),PageBreak()]

for section in catalog:
    story += [p(section['name'],'Section')]
    passed=sum(c['result']=='PASS' for c in section['cases']);pending=sum(c['result']=='NOT RUN' for c in section['cases'])
    story += [p(f'{len(section["cases"])} scenarios | {passed} executed pass | {pending} pending manual. Evidence IDs are expanded in the final appendix.','Small')]
    rows=[['CASE / SCENARIO','PRECONDITIONS AND STEPS','EXPECTED RESULT','EXECUTION']]
    for c in section['cases']:
        scenario=p(f'<b>{escape(c["id"])}</b><br/>{escape(clean(c["scenario"]))}','Cell',True)
        action=p(f'<b>Given:</b> {escape(clean(c["preconditions"]))}<br/><br/><b>Do:</b> {escape(clean(c["steps"]))}','Cell',True)
        result=p(f'{c["result"]}<br/>{c["method"]}<br/>{c["testId"]}','Warn' if c['result']=='NOT RUN' else 'Result',True)
        rows.append([scenario,action,c['expected'],result])
    story.append(table(rows,[158,256,248,CONTENT-662]));story.append(PageBreak())

story += [p('Executed-test evidence index','Section'),p('Multiple catalog rows can map to one executable test when that test asserts each listed behavior. The index below comes from the actual final runner JSON, not a manually declared pass list.','Small')]
rows=[['ID / METHOD','EXECUTABLE TEST','RESULT / TIME','SOURCE']]
for t in tests:rows.append([t['id'],t['name'],f'{t["status"].upper()} / {t["durationMs"]/1000:.2f}s',t['source']])
story.append(table(rows,[80,360,110,CONTENT-550]));story.append(PageBreak())
story += [p('Remaining checks and handoff','Section'),p('Gmail activation','Sub'),p('From the repository root, run powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-gmail.ps1. Enter the sender address and app password only at its local prompt. Run node scripts/check-email.cjs, then restart the API. Use an actual recipient for signup and password reset to verify inbox delivery. Never put the app password in the PDF, chat or GitHub.'),p('Google app passwords require 2-Step Verification and may be unavailable under account restrictions. Gmail sending limits still apply. The project does not purchase a plan or enable billing.','Small'),p('Official setup references','Sub'),p('<link href="https://support.google.com/mail/answer/185833?hl=en" color="#174735">Google: Sign in with app passwords</link><br/><link href="https://nodemailer.com/smtp" color="#174735">Nodemailer: SMTP transport, TLS and STARTTLS</link>','Text',True),p('Manual execution record','Sub'),p('For each NOT RUN scenario, record tester, date, environment, actual outcome and supporting screenshot/log. Keep synthetic data for destructive/load/recovery tests. A successful code connection check alone does not establish successful inbox delivery.'),p('Release evidence','Sub'),p('TypeScript checking and production build passed. npm audit reported zero known vulnerabilities at the review snapshot. These checks complement the behavioral results and do not guarantee that undiscovered defects or vulnerabilities are absent.'),p('API run: '+manifest['apiRunStartedAt']+' | Browser run: '+manifest['browserRunStartedAt'],'Small'),p('Code SHA-256: '+fingerprint,'Small')]

def footer(canvas,doc):
    canvas.saveState();canvas.setFillColor(GREEN);canvas.rect(MARGIN,HEIGHT-26,CONTENT,3,fill=1,stroke=0)
    canvas.setFont('VeraBold',8);canvas.drawString(MARGIN,HEIGHT-39,'STOCKSENSE  /  END-TO-END QUALITY REVIEW')
    canvas.setStrokeColor(LINE);canvas.line(MARGIN,30,WIDTH-MARGIN,30);canvas.setFillColor(MUTED);canvas.setFont('Vera',8)
    canvas.drawString(MARGIN,17,'26 September 2026  |  Local test environment  |  Volente Dynamics');canvas.drawRightString(WIDTH-MARGIN,17,f'Page {doc.page}');canvas.restoreState()
output.parent.mkdir(parents=True,exist_ok=True)
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(json.dumps(dict(output=str(output),cases=len(cases),results=counts,tests=manifest['testCounts'],fingerprint=fingerprint),indent=2))
