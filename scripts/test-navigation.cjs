// Exact operator walkthroughs. Kept separate from the historical execution evidence.
const exact = {};
const q = (text) => `"${text}"`;
const click = (text) => `Click ${q(text)}.`;
const side = (text) => `In the left sidebar, click ${q(text)}.`;
const set = (field, value) => `Set ${q(field)} to ${q(value)}.`;
const select = (field, value) => `Open ${q(field)} and select ${q(value)}.`;
const main = 'QAT / QA Main';
const rack = 'QAT / QA Rack';
const branch = 'QAB / QA Branch Stock';
const name = (id) => `QA ${id} 01`;
const sku = (id) => `QA-${id}-01`;
function add(
  id,
  steps,
  expected,
  preconditions = 'Signed in as an inventory manager. Complete setup SETUP-01 first.',
  surface = 'Browser',
) {
  exact[id] = {
    navigation: steps,
    manualExpected: expected,
    manualPreconditions: preconditions,
    surface,
  };
}
function product(id, quantity = 0, unit = 'Pieces (pcs)', category = 'QA Tests') {
  return [
    side('Products'),
    click('New product'),
    `In the ${q('New product')} dialog, set ${q('Name')} to ${q(name(id))} and ${q('SKU')} to ${q(sku(id))}.`,
    select('Category', category),
    `Select ${q(unit)} in ${q('Unit of measure')}; set ${q('Unit cost (₹)')} to ${q('100')}.`,
    ...(quantity
      ? [
          `Under ${q('Opening stock')}, set ${q('Quantity')} to ${q(String(quantity))}; select ${q(main)} in ${q('Location')}.`,
        ]
      : [`Leave the optional ${q('Opening stock')} ${q('Quantity')} blank.`]),
    click('Save product'),
  ];
}
function operation(
  type,
  id,
  quantity,
  { source = main, destination = main, save = true, notes = '' } = {},
) {
  const plural = {
    Receipt: 'Receipts',
    Delivery: 'Deliveries',
    Transfer: 'Internal transfers',
    Adjustment: 'Adjustments',
  }[type];
  return [
    side(plural),
    click('New ' + type.toLowerCase()),
    ...(['Delivery', 'Transfer'].includes(type) ? [select('Source location', source)] : []),
    ...(type !== 'Delivery'
      ? [select(type === 'Adjustment' ? 'Count location' : 'Destination location', destination)]
      : []),
    ...(['Receipt', 'Delivery'].includes(type)
      ? [
          select(
            type === 'Receipt' ? 'Supplier' : 'Customer',
            type === 'Receipt' ? 'QA Supplier' : 'QA Customer',
          ),
        ]
      : []),
    `Keep ${q('Scheduled date')} at its prefilled current date/time and ${q('Responsible')} at your signed-in name.`,
    ...(type === 'Adjustment' ? [set('Reason for adjustment', 'QA physical count')] : []),
    `In the first product row, select ${q(name(id) + ' · ' + sku(id))} in the product dropdown (${q('Product 1')}); enter ${q(String(quantity))} in the adjacent quantity box (${q('Quantity 1')}${type === 'Adjustment' ? ', beneath the visible Counted heading' : ''}).`,
    ...(notes ? [set('Notes (optional)', notes)] : []),
    ...(save
      ? [
          click('Create draft'),
          'Write down the generated reference displayed as the page heading. Use this exact reference when reopening the document.',
        ]
      : []),
  ];
}
const finish = (type) => [
  click('Confirm'),
  ...(type === 'Delivery' ? [click('Mark as picked'), click('Mark as packed')] : []),
  click('Validate'),
];
function stock(id, location = main) {
  return [
    side('Stock on hand'),
    `In the search box with placeholder ${q('Search product name or SKU…')} (${q('Search stock')}), type ${q(sku(id))}.`,
    `In the ${q('All locations')} dropdown (${q('Stock location')}), select ${q(location)}.`,
    'Read the On hand, Reserved and Available columns in this product row.',
  ];
}
const openReference = (section, ref = 'the reference you wrote down') => [
  side(section),
  `In ${q('Search reference, contact, or product…')} (${q('Search operations')}), enter ${ref}.`,
  'Click that exact reference in the first column; do not select an unrelated record.',
];
const cancel = [
  click('Cancel operation'),
  `In the ${q('Cancel this operation?')} dialog, click its red ${q('Cancel operation')} button.`,
];
const login = (identity = 'manager', password = '<CURRENT_MANAGER_PASSWORD>') => [
  'Open http://127.0.0.1:5173/login. If already signed in, first click Sign out at the bottom of the sidebar.',
  set('Login ID or email', identity),
  set('Password', password),
  click('Sign in'),
];
const signup = [
  'Open http://127.0.0.1:5173/login while signed out.',
  click('Create an account'),
  set('Full name', 'QA Email Tester'),
  set('Login ID', '<NEW_LOGIN_ID>'),
  set('Email address', '<TEST_EMAIL>'),
  `Set ${q('Password')} and ${q('Confirm password')} to ${q('QaTest!2026')}.`,
  click('Create account & send code'),
];
const verify = [
  set('Email address', '<TEST_EMAIL>'),
  set('Verification code', '<LATEST_VERIFICATION_CODE>'),
  set('Account password', 'QaTest!2026'),
  click('Verify email'),
];
const forgot = [
  'Open http://127.0.0.1:5173/login while signed out.',
  click('Forgot password?'),
  set('Email address', '<TEST_EMAIL>'),
  click('Send reset code'),
];
const reset = [
  set('Email address', '<TEST_EMAIL>'),
  set('Reset code', '<LATEST_RESET_CODE>'),
  `Set ${q('New password')} and ${q('Confirm password')} to ${q('QaReset!2026')}.`,
  click('Update password'),
];
const team = [
  side('Settings'),
  click('Team'),
  'Find the row matching <TEST_EMAIL>; never change an unrelated account.',
];
const rule = (id, minimum, target) => [
  side('Settings'),
  click('Reordering rules'),
  click('Add rule'),
  select('Product', name(id) + ' · ' + sku(id)),
  select('Location', main),
  set('Minimum quantity', String(minimum)),
  set('Target quantity', String(target)),
  click('Save reordering rule'),
];
const editProduct = (id) => [
  side('Products'),
  `Type ${q(sku(id))} in ${q('Search products or SKU…')} (${q('Search products')}).`,
  `Click the pencil icon at the far right of the ${q(name(id))} row (accessible name ${q('Edit ' + name(id))}).`,
];

add(
  'AUTH-01',
  login(),
  'Overview opens. The sidebar includes Settings and the Products page has New product.',
  'An active, verified manager account; its current password is known.',
);
add(
  'AUTH-02',
  [
    ...login('warehouse', '<CURRENT_STAFF_PASSWORD>'),
    side('Products'),
    'Check the top-right actions: New product must be absent.',
    side('Adjustments'),
    'Check New adjustment: it must be disabled.',
  ],
  'Staff can view these pages but cannot create products or physical counts.',
  'An active, verified warehouse staff account; its current password is known.',
);
add(
  'AUTH-03',
  [
    'Open http://127.0.0.1:5173/login while signed out.',
    'Leave Login ID or email and Password empty.',
    click('Sign in'),
    set('Login ID or email', 'nonexistentqa'),
    set('Password', 'WrongPassword!2026'),
    click('Sign in'),
  ],
  'Required-field errors first; then Invalid login ID or password. The workspace never opens.',
  'Signed out.',
);
add(
  'AUTH-04',
  [
    'Open http://127.0.0.1:5173/login while signed out.',
    set('Password', 'QaTest!2026'),
    'Click the eye icon at the right of Password (accessible name Show password).',
    'Read the unchanged value; click the same icon again, now named Hide password.',
  ],
  'Password becomes visible then masked without changing its value.',
  'Signed out; no login submission is needed.',
);
add(
  'AUTH-06',
  [
    ...signup.slice(0, 6),
    set('Confirm password', 'Different!2026'),
    click('Create account & send code'),
  ],
  'Passwords do not match. No registration email is sent.',
  'Signed out. Use a unique <NEW_LOGIN_ID> and a tester-controlled <TEST_EMAIL>.',
);
add(
  'AUTH-07',
  [
    ...signup,
    'Confirm the Verify your email. screen is shown.',
    'Open http://127.0.0.1:5173/ in the same tab before verifying.',
  ],
  'The workspace remains inaccessible. Signup alone does not grant a session.',
  'Signed out; unique <NEW_LOGIN_ID> and <TEST_EMAIL>.',
);
add(
  'AUTH-08',
  [
    ...signup.slice(0, -1),
    'Use an existing test Login ID and Email address instead of new values.',
    click('Create account & send code'),
  ],
  'This record already exists. Use a unique code, name, or email.',
  'Signed out; an existing disposable test account with known identity/email.',
);
add(
  'AUTH-10',
  [
    ...signup,
    'On Verify your email., look beneath Verify email for the disabled Resend in Ns button.',
    'If the page shows Development email mode, click local test inbox; open the message whose To address is <TEST_EMAIL>. If Gmail is configured, open that inbox and the message Your StockSense email verification code.',
    'Read the six-digit code; do not expect a local test inbox link in Gmail mode.',
  ],
  'A six-digit code arrives; resend is initially disabled and becomes Resend code after 60 seconds. The local-inbox notice appears only in local mode.',
  'Unique test account/email. The normal app currently uses Gmail; automated regression tests use Mailpit.',
);
add(
  'AUTH-11',
  [
    'Open http://127.0.0.1:5173/login while signed out.',
    click('Verify an existing account'),
    ...verify.slice(0, 2),
    set('Account password', 'WrongPassword!2026'),
    click('Verify email'),
  ],
  'Verification rejects the wrong account password; the account stays unverified.',
  'An unverified disposable account and its latest unexpired verification email.',
);
add(
  'AUTH-12',
  [
    'Open http://127.0.0.1:5173/login while signed out.',
    click('Verify an existing account'),
    ...verify,
    set('Login ID or email', '<NEW_LOGIN_ID>'),
    set('Password', 'QaTest!2026'),
    click('Sign in'),
  ],
  'Email verification succeeds, then login says a manager must approve workspace access.',
  'Unverified, pending disposable account; latest verification code is available.',
);
add(
  'AUTH-13',
  [
    ...team,
    'In that row, click Approve.',
    'In Change account access?, click Confirm access change.',
    'In a separate private browser window, open http://127.0.0.1:5173/login.',
    set('Login ID or email', '<NEW_LOGIN_ID>'),
    set('Password', 'QaTest!2026'),
    click('Sign in'),
  ],
  'Team shows Active; the new staff account opens Overview.',
  'Manager signed in; test account is Email verified / Awaiting manager approval.',
);
add(
  'AUTH-16',
  [
    ...team,
    'Click Make manager in the disposable staff account row.',
    click('Confirm access change'),
    'In the private window where that account was already signed in, reload the page.',
    'Sign in there again using its current Login ID or email and Password.',
  ],
  'The old session ends. After a new login the account is an Inventory manager.',
  'Manager in window A; disposable active staff account already signed in in private window B.',
);
add(
  'AUTH-17',
  [
    ...team,
    'Click Disable in the disposable account row.',
    click('Confirm access change'),
    'Reload the already-signed-in private window for that account.',
    'At Sign in, enter its correct login and password and click Sign in.',
  ],
  'Old access ends immediately; correct credentials are rejected while Disabled.',
  'Manager in A; disposable active account signed in in private window B.',
);
add(
  'AUTH-19',
  [
    side('Overview'),
    'At the bottom of the sidebar, click Sign out.',
    'Press the browser Back button; then reload the page.',
  ],
  'The login screen is shown; previously visited protected screens cannot be used.',
  'Signed in. On mobile open the hamburger Open navigation first.',
);
add(
  'AUTH-20',
  [
    'Click your avatar/name at the bottom of the sidebar, immediately above Sign out.',
    set('Full name', 'QA Display Name'),
    click('Save profile'),
    'Reload the page; compare Full name, Login ID and Email address.',
  ],
  'Full name persists. Login ID and Email address remain read-only and unchanged.',
  'Signed in as a disposable account, so changing the display name is acceptable.',
);
add(
  'AUTH-22',
  [
    ...team,
    'Click Enable in the Disabled test-account row.',
    click('Confirm access change'),
    'In the test account private window, reload any old protected page before signing in again.',
    'Enter its current credentials on Sign in and click Sign in.',
  ],
  'The old session remains invalid; a new sign-in succeeds.',
  'Manager signed in; verified disposable account is Disabled.',
);
add(
  'AUTH-23',
  [
    'Use two separate browser profiles. Sign in as test manager A in one and test manager B in the other.',
    'In both windows, click Settings, then Team.',
    "In A, click Make staff in B's row. In B, click Make staff in A's row.",
    'Arrange the windows side by side; submit Confirm access change in both as close together as possible.',
    'Reload Team in both windows and inspect active manager roles. If timing was not simultaneous, record the trial as inconclusive and repeat in the isolated environment.',
  ],
  'At least one active manager remains. Conflicting/stale actions reject or lose authorization.',
  'Isolated disposable workspace with exactly two active verified test managers. Do not use your only real manager.',
  'Manual concurrency',
);

add(
  'MAIL-01',
  [
    ...forgot,
    'Open the receiving inbox. In local mode, use local test inbox and open Your StockSense password reset code addressed to <TEST_EMAIL>. In Gmail mode, open the same subject in your Gmail inbox.',
    'Copy the six-digit code and complete the reset using MAIL-03.',
  ],
  'The email contains a usable code; the app moves to Set a new password.',
  'Signed out; disposable account registered to <TEST_EMAIL>.',
);
add(
  'MAIL-02',
  [
    ...forgot.slice(0, 2),
    set('Email address', '<UNREGISTERED_TEST_EMAIL>'),
    click('Send reset code'),
    'Record the confirmation message. Return with Back to sign in, click Forgot password?, enter <TEST_EMAIL>, and click Send reset code once.',
  ],
  'Both requests show the same generic If this email is registered message.',
  'One registered and one unregistered tester-controlled address; requests stay below rate limits.',
);
add(
  'MAIL-03',
  [
    ...forgot,
    'Open Your StockSense password reset code in the receiving inbox and note its newest six-digit code.',
    ...reset,
    set('Login ID or email', '<NEW_LOGIN_ID>'),
    set('Password', 'QaReset!2026'),
    click('Sign in'),
    'Reload the previously signed-in account in the other browser profile.',
  ],
  'New password signs in; the previous session returns to login.',
  'Disposable active verified account; its old session is open in a separate browser profile.',
);
add(
  'MAIL-05',
  [
    'Complete MAIL-03 and keep the used code.',
    'Click Sign out. Open http://127.0.0.1:5173/reset-password directly.',
    set('Email address', '<TEST_EMAIL>'),
    set('Reset code', '<USED_RESET_CODE>'),
    'Set New password and Confirm password to AnotherQa!2026.',
    click('Update password'),
  ],
  'The code is invalid, expired, or already used. QaReset!2026 remains the password.',
  'MAIL-03 completed on a disposable account.',
);
add(
  'MAIL-06',
  [
    ...forgot,
    'Record the received reset code and wait more than 10 minutes without requesting another code.',
    ...reset,
  ],
  'The expired code is rejected; the password is unchanged.',
  'Disposable account; allow 11 minutes for the expiry check.',
);
add(
  'MAIL-07',
  [
    'Open /login, click Verify an existing account.',
    set('Email address', '<TEST_EMAIL>'),
    set('Account password', 'QaTest!2026'),
    'Enter a six-digit Verification code different from the actual code; click Verify email.',
    'Repeat the previous step until five wrong submissions have completed.',
    'Now enter the actual newest Verification code and click Verify email.',
  ],
  'The correct code is rejected after five failed code attempts. A new code is required.',
  'Unverified disposable account with fresh code; use the correct account password every time.',
);
add(
  'MAIL-08',
  [
    ...forgot,
    set('Email address', '<TEST_EMAIL>'),
    set('Reset code', '<VERIFICATION_CODE>'),
    'Set New password and Confirm password to QaReset!2026.',
    click('Update password'),
  ],
  'A verification code cannot be used as a password-reset code.',
  'Pending account with a current verification code. The reset request must also be sent, but do not use its reset code.',
);
add(
  'MAIL-09',
  [
    'Open /login and click Verify an existing account.',
    'Wait until more than 10 minutes after the verification email was requested; do not resend.',
    ...verify,
  ],
  'The expired verification code is rejected and no account access is granted.',
  'Unverified account and original verification code; allow 11 minutes.',
);
add(
  'MAIL-10',
  [
    ...signup,
    'Observe Resend in Ns beneath Verify email; it is disabled until the countdown ends.',
    'Keep the original email/code. After the button changes to Resend code, click Resend code once.',
    'Open the replacement verification email. First submit the original code with Email address and Account password using Verify email.',
    'Then replace Verification code with the latest code and click Verify email.',
  ],
  'Early resend is disabled in UI; old code rejects after replacement; latest code verifies. The API test separately proves HTTP 429 on a forced early request.',
  'Fresh unverified account; fewer than five code requests within 15 minutes.',
);
add(
  'MAIL-12',
  [
    'Open http://127.0.0.1:5173/reset-password while signed out.',
    set('Email address', '<UNREGISTERED_TEST_EMAIL>'),
    set('Reset code', '000000'),
    'Set New password and Confirm password to QaReset!2026.',
    click('Update password'),
  ],
  'Invalid/expired/used code error appears; entered fields remain available to correct.',
  'Unregistered tester-controlled email; no mail is sent by this step.',
);
add(
  'MAIL-14',
  [
    'Open PowerShell.',
    'Run: Set-Location -LiteralPath "C:\\WorkSpace\\Private\\StockSense"',
    'Run: node scripts/check-email.cjs',
    'Read the printed result; do not print or paste the .env file.',
  ],
  'SMTP connection and authentication succeeded. No email was sent.',
  'Owner has configured Gmail locally.',
  'Terminal',
);
add(
  'MAIL-15',
  [
    ...signup,
    'Open Gmail and the newest Your StockSense email verification code addressed to <TEST_EMAIL>.',
    ...verify,
    set('Login ID or email', '<NEW_LOGIN_ID>'),
    set('Password', 'QaTest!2026'),
    click('Sign in'),
  ],
  'Actual Gmail delivery succeeds; code verifies; pending account still requires manager approval.',
  'Gmail enabled; unique Login ID and tester-controlled real Gmail address.',
);
add(
  'MAIL-16',
  [
    ...forgot,
    'Open Gmail and the newest Your StockSense password reset code addressed to <TEST_EMAIL>.',
    ...reset,
    set('Login ID or email', '<NEW_LOGIN_ID>'),
    set('Password', '<OLD_TEST_PASSWORD>'),
    click('Sign in'),
    set('Password', 'QaReset!2026'),
    click('Sign in'),
    'Reload the old session in the other browser profile, then repeat MAIL-05 using this consumed code.',
  ],
  'Email arrives; old password/session fail; new password works; consumed reset code rejects.',
  'Disposable active verified Gmail account; old password known and old session open in another profile.',
);
add(
  'MAIL-17',
  [
    'Use a separate developer-run app instance configured with a deliberately unreachable SMTP host and a disposable database; keep the normal Gmail app unchanged.',
    'Open that test instance /login; click Forgot password?.',
    set('Email address', '<TEST_EMAIL>'),
    click('Send reset code'),
    'Wait for the bounded request to fail; record the displayed error and elapsed time.',
    'Have the developer restore valid SMTP in that test instance and restart its API.',
    'Return with Back to sign in, click Forgot password?, enter the same Email address and click Send reset code.',
    'Open the delivered email; complete MAIL-03 on that test instance.',
  ],
  'No false success during outage; clear error; successful reset after recovery.',
  'Developer must first provision the isolated outage instance. No SMTP settings button exists in StockSense.',
  'Manual environment',
);

add(
  'NAV-01',
  [
    side('Overview'),
    'In the first dashboard dropdown (All operations), select Receipts.',
    'In All statuses, select Ready; in All categories, select QA Tests.',
    click('View all operations'),
    'Read the Operation status and Operation category dropdown selections on the operation list.',
  ],
  'Receipts opens with Ready and QA Tests retained.',
);
add(
  'NAV-02',
  [
    side('Deliveries'),
    'In All statuses (Operation status), select Waiting.',
    'Click a waiting test document reference in the Reference column.',
    click('Back to deliveries'),
  ],
  'Deliveries reopens with Waiting still selected.',
  'At least one waiting test delivery; use DEL-03 if needed.',
);
add(
  'NAV-03',
  [
    side('All operations'),
    'Click the three-column icon at the right of the filters (Kanban view).',
    'Reload the page using the browser Reload button.',
  ],
  'Kanban stays selected with Draft, Waiting, Ready, Done and Canceled columns.',
);
add(
  'NAV-04',
  [
    side('Deliveries'),
    'Click the three-column icon (Kanban view).',
    'Open All statuses (Operation status) and select Waiting.',
  ],
  'Only the Waiting Kanban column is displayed.',
);
add(
  'NAV-05',
  [
    side('Stock on hand'),
    'In the top-right warehouse selector (Warehouse scope), choose QA Branch.',
    'Reload the page.',
    'Inspect the Location column and the selected warehouse name.',
    'Restore Warehouse scope to All warehouses.',
  ],
  'QA Branch remains selected after reload; QA Main stock is excluded.',
);
add(
  'NAV-06',
  [
    'Use a browser viewport narrower than 900 px; open Overview.',
    'Click the top-left hamburger icon (Open navigation).',
    click('Stock on hand'),
  ],
  'Drawer closes and the Stock on hand page opens.',
  'Signed in on a narrow window or mobile device.',
);
add(
  'NAV-07',
  [
    'On a viewport narrower than 900 px, click the top-left hamburger (Open navigation).',
    'Press Escape on a hardware keyboard.',
    'Observe the focus outline on the hamburger button.',
  ],
  'Drawer closes and focus returns to Open navigation.',
  'Signed in on a narrow desktop browser window.',
);
add(
  'NAV-08',
  [
    side('Settings'),
    'Click Warehouses, then press Tab/Shift+Tab until the Warehouses tab itself has keyboard focus.',
    'Press Right Arrow once; then press End and Home.',
  ],
  'Right Arrow activates Locations; End activates Team; Home returns to Warehouses.',
);
add(
  'NAV-09',
  [
    side('Products'),
    click('New product'),
    'Observe the text cursor in Name; do not type or change any field.',
    'Press Escape.',
  ],
  'Name gets focus automatically; untouched dialog closes.',
);
add(
  'NAV-10',
  [
    side('Receipts'),
    click('New receipt'),
    'Change the first quantity box (Quantity 1) from 1 to 5.',
    'Click the X at the top-right of the dialog (Close dialog).',
    'In Discard unsaved changes?, click Keep editing.',
    'Check Quantity 1 still contains 5. Click Close dialog again, then Discard changes.',
  ],
  'Keep editing preserves inputs; Discard changes closes without saving.',
);
add(
  'NAV-12',
  [
    'In Chrome/Edge press F12, then Ctrl+Shift+M to open the device toolbar.',
    'Choose Responsive and set width 390, height 900; open Overview.',
    'Scroll from the title through the last dashboard panel; check for horizontal page scrolling and clipped controls.',
    'Repeat at widths 768 and 1280. Turn the device toolbar off with Ctrl+Shift+M.',
  ],
  'Page fits each width; actions remain reachable. Wide tables may scroll inside their own panel.',
  'Signed in; Chrome or Edge developer tools available.',
  'Browser + developer tools',
);
add(
  'NAV-13',
  [
    'Enter http://127.0.0.1:5173/history?from=not-a-date&to=oops in the browser address bar and press Enter.',
  ],
  'Move history opens without a date parsing crash.',
);
add(
  'NAV-14',
  [
    'Enter http://127.0.0.1:5173/does-not-exist in the address bar and press Enter.',
    click('Go to overview'),
  ],
  'Overview opens from the not-found screen.',
);
add(
  'NAV-16',
  [
    'Reload Overview and press Tab until Skip to content is visible; press Enter.',
    'Use Tab/Shift+Tab to reach sidebar Products; press Enter.',
    'Tab to New product; press Enter. Traverse fields with Tab, move select options with arrow keys, then press Escape without changes.',
    'Navigate to Settings using the keyboard. Exercise Left/Right Arrow, Home and End on the tabs.',
    'In a narrow browser window, open and close the hamburger drawer with keyboard and Escape.',
    'On a disposable Ready delivery, use Tab/Enter to activate Mark as picked, Mark as packed, then Validate.',
  ],
  'Focus is visible and logical; no trap; every required action works without the mouse.',
  'Disposable ready delivery prepared through DEL-01 before its pick step.',
  'Manual accessibility',
);
add(
  'NAV-17',
  [
    'On Windows start Narrator with Win+Ctrl+Enter (or use your configured screen reader).',
    'Open /login and move through Login ID or email, Password, Show password and Sign in.',
    'Submit empty fields and listen for error announcements.',
    'Sign in; navigate to Products, open New product, then close it.',
    'Read the Stock on hand table headers and one row. Open a test operation and read its status.',
    'Stop Narrator with Win+Ctrl+Enter; record any missing names, relations or announcements.',
  ],
  'Headings, fields, dialog title, errors, state and table relationships are understandable.',
  'A screen reader is available; use disposable test data.',
  'Manual accessibility',
);
add(
  'NAV-18',
  [
    'In a desktop browser open its menu and set Zoom to 200%.',
    'Open /signup and inspect all fields and Create account & send code; do not submit unless testing an owned address.',
    'Sign in; click Receipts, then New receipt; inspect all fields and the Create draft/Cancel footer.',
    'Close the dialog and restore Zoom to 100%.',
    'On a physical device with a reachable test URL, repeat these pages and the receipt steps in REC-01.',
  ],
  'Text and controls remain usable; nothing essential is clipped.',
  'Desktop browser plus physical-device access to a separately reachable test deployment. localhost on a phone is the phone itself.',
  'Manual device',
);

add(
  'CAT-01',
  [
    side('Settings'),
    click('Categories'),
    click('Add category'),
    set('Name', 'QA Extra Category 01'),
    click('Save category'),
    side('Products'),
    click('New product'),
    'Open Category and locate QA Extra Category 01.',
    'Click Close dialog without changing any field.',
  ],
  'New category is listed in Settings and selectable in a product.',
);
add(
  'CAT-02',
  [
    side('Settings'),
    click('Categories'),
    click('Add category'),
    set('Name', 'QA Tests'),
    click('Save category'),
    'After the duplicate error, replace Name with three spaces and click Save category again.',
    'Click Close dialog, then Discard changes.',
  ],
  'Duplicate and whitespace-only names are rejected; no extra category is created.',
);
add(
  'CAT-03',
  [
    side('Settings'),
    click('Warehouses'),
    click('Add warehouse'),
    set('Name', 'QA Extra Depot 01'),
    set('Short code', 'QAX01'),
    set('Address', 'QA test address'),
    click('Save warehouse'),
    click('Locations'),
    click('Add location'),
    'Open Warehouse and locate QA Extra Depot 01; close the unchanged dialog.',
  ],
  'Warehouse card exists and is selectable for a location.',
);
add(
  'CAT-04',
  [
    side('Settings'),
    click('Warehouses'),
    click('Add warehouse'),
    set('Name', 'QA Invalid Code'),
    set('Short code', 'QA BAD'),
    click('Save warehouse'),
    'Read the validation error; click Close dialog, then Discard changes.',
  ],
  'The code with a space is rejected.',
);
add(
  'CAT-05',
  [
    side('Settings'),
    click('Locations'),
    click('Add location'),
    set('Name', 'QA Extra Rack 01'),
    set('Short code', 'EXTRA01'),
    select('Warehouse', 'QA Test Warehouse'),
    click('Save location'),
  ],
  'Locations shows QA Extra Rack 01 under QA Test Warehouse.',
);
add(
  'CAT-06',
  [
    side('Settings'),
    click('Contacts'),
    click('Add contact'),
    set('Name', 'QA Extra Supplier 01'),
    select('Contact type', 'Supplier'),
    set('Email', 'qa-supplier@example.com'),
    set('Phone', '1234567890'),
    set('Address', 'QA test address'),
    click('Save contact'),
  ],
  'Contact row displays Supplier with the saved details. No contact email is sent.',
);
add(
  'CAT-07',
  [
    side('Settings'),
    click('Contacts'),
    click('Add contact'),
    set('Name', 'QA Invalid Email'),
    select('Contact type', 'Supplier'),
    set('Email', 'not-an-email'),
    click('Save contact'),
    'Read browser/form validation. Close dialog and Discard changes.',
  ],
  'Malformed email is not saved. API evidence separately verifies server-side HTTP 400.',
);
add(
  'CAT-08',
  product('CAT08'),
  'Products shows QA CAT08 01, SKU QA-CAT08-01, Active, with zero on hand.',
);
add(
  'CAT-09',
  [
    ...product('CAT09', 15),
    ...stock('CAT09'),
    side('Move history'),
    'Type QA-CAT09-01 in Search reference, contact, or product… (Search history).',
  ],
  'On hand 15, Reserved 0, Available 15; opening adjustment in history is +15 pcs.',
);
add(
  'CAT-10',
  [
    ...product('CAT10'),
    ...editProduct('CAT10'),
    set('Description', 'QA description edited'),
    click('Save product'),
    ...editProduct('CAT10'),
    'Read Description; close the unchanged dialog.',
  ],
  'Edited description persists and on hand stays zero.',
);
add(
  'CAT-11',
  [
    ...product('CAT11', 5),
    ...editProduct('CAT11'),
    'Uncheck Active product.',
    click('Save product'),
    'Read the Clear remaining stock error; recheck Active product and click Save product.',
  ],
  'Product cannot be archived while stock remains.',
);
add(
  'CAT-12',
  [
    ...product('CAT12'),
    ...editProduct('CAT12'),
    'Uncheck Active product.',
    click('Save product'),
    'Check Include archived above the product table.',
  ],
  'Product disappears from the active-only list, then appears as Archived.',
);
add(
  'CAT-13',
  [
    ...product('CAT13', 5),
    ...editProduct('CAT13'),
    select('Unit of measure', 'Kilograms (kg)'),
    click('Save product'),
    'Read the rejection; restore Pieces (pcs) and click Save product.',
  ],
  'A product with stock history cannot change unit.',
);
add(
  'CAT-14',
  [
    ...product('CAT14', 5),
    side('Settings'),
    click('Locations'),
    'In the QA Main row, click its pencil icon (Edit QA Main).',
    select('Warehouse', 'QA Branch'),
    click('Save location'),
    'Read the rejection; restore QA Test Warehouse and click Save location.',
  ],
  'Used location cannot move to another warehouse.',
);
add(
  'CAT-15',
  [
    ...product('CAT15'),
    ...operation('Receipt', 'CAT15', 1),
    ...finish('Receipt'),
    side('Settings'),
    click('Contacts'),
    'In the QA Supplier row, click its pencil icon (Edit QA Supplier).',
    select('Contact type', 'Customer'),
    click('Save contact'),
    'Read the rejection; restore Supplier and click Save contact.',
  ],
  'Supplier with receipt history cannot be retyped as a customer.',
);
add(
  'CAT-17',
  [
    ...product('CAT17'),
    ...rule('CAT17', 4, 12),
    'In the QA CAT17 01 / QAT / QA Main rule row, click the pencil icon (Edit reordering rule).',
    set('Minimum quantity', '5'),
    click('Save reordering rule'),
  ],
  'The same rule row changes to Minimum 5 / Target 12; no duplicate row.',
);
add(
  'CAT-18',
  [
    ...product('CAT18'),
    ...rule('CAT18', 100, 50),
    'Read the target-at-least-minimum error.',
    set('Target quantity', '150'),
    click('Save reordering rule'),
  ],
  '100/50 rejects; 100/150 saves.',
);
add(
  'CAT-19',
  [
    ...product('CAT19'),
    ...rule('CAT19', 1.5, 5),
    'Read the whole-piece validation error; close dialog and Discard changes.',
  ],
  'Fractional piece thresholds are rejected.',
);
add(
  'CAT-21',
  [
    side('Settings'),
    click('Categories'),
    'Click the pencil icon for QA Extra Category 01 (from CAT-01); set Name to QA Renamed Category 01; click Save category.',
    click('Warehouses'),
    'Click the pencil icon on QA Extra Depot 01 (from CAT-03); set Address to QA revised address; click Save warehouse.',
    click('Locations'),
    'Click the pencil icon for QA Extra Rack 01 (from CAT-05); set Short code to EXTRA02; click Save location.',
    click('Contacts'),
    'Click the pencil icon for QA Extra Supplier 01 (from CAT-06); set Phone to 9876543210; click Save contact.',
    'Reload Settings and revisit all four tabs.',
  ],
  'Changed details persist; warehouse/location/contact relationships remain correct.',
  'Complete CAT-01, CAT-03, CAT-05 and CAT-06 first.',
);
add(
  'CAT-22',
  [
    side('Products'),
    'Check Include archived.',
    'Search QA-CAT12-01 in Search products or SKU….',
    'Click the pencil icon in QA CAT12 01 (Edit QA CAT12 01).',
    'Check Active product.',
    click('Save product'),
    'Uncheck Include archived.',
  ],
  'Product remains visible with status Active.',
  'CAT-12 completed; its archived product has no stock.',
);

add(
  'DOC-01',
  [...product('DOC01'), ...operation('Receipt', 'DOC01', 5), ...stock('DOC01')],
  'Draft exists but on hand remains 0. Validate is required to add stock.',
);
add(
  'DOC-02',
  [
    ...product('DOC02'),
    ...operation('Receipt', 'DOC02', 3),
    click('Edit draft'),
    set('Quantity 1', '8'),
    set('Notes (optional)', 'QA edited notes'),
    click('Save changes'),
    'Compare the page heading with the reference you wrote down.',
  ],
  'Reference is unchanged after editing.',
);
add(
  'DOC-03',
  [
    ...product('DOC03'),
    ...operation('Receipt', 'DOC03', 3),
    click('Edit draft'),
    set('Quantity 1', '8'),
    set('Notes (optional)', 'QA final quantity eight'),
    click('Save changes'),
    ...finish('Receipt'),
    ...stock('DOC03'),
  ],
  'Notes are saved; exactly 8 pieces are received.',
);
add(
  'DOC-06',
  [
    ...product('DOC06'),
    ...operation('Receipt', 'DOC06', 5, { save: false }),
    click('Add product'),
    `In the second product row (${q('Product 2')}), select ${q(name('DOC06') + ' · ' + sku('DOC06'))}; keep Quantity 2 at 1.`,
    click('Create draft'),
    'Read Each product can appear only once. Combine duplicate quantities.',
    'Click the trash icon in row 2 (Remove product 2).',
    set('Quantity 1', '6'),
    click('Create draft'),
  ],
  'Duplicate rows reject; combining the quantity into one row creates the draft.',
);
add(
  'DOC-12',
  [
    ...product('DOC12'),
    ...operation('Receipt', 'DOC12', 5),
    click('Cancel operation'),
    'In Cancel this operation?, click Keep operation.',
    'Confirm the draft is still open; click Cancel operation again.',
    'In the dialog, click its red Cancel operation button.',
  ],
  'First choice preserves the draft; second marks it Canceled without stock movement.',
);
add(
  'DOC-13',
  [
    ...product('DOC13'),
    ...operation('Receipt', 'DOC13', 5),
    ...cancel,
    'Reload the canceled document.',
    'Check that Confirm, Edit draft and Validate are absent.',
    ...stock('DOC13'),
  ],
  'Canceled document cannot be revived through the UI; stock stays zero. API evidence also proves forced confirm/validate requests reject.',
);
add(
  'DOC-14',
  [
    ...product('DOC14'),
    ...operation('Receipt', 'DOC14', 5),
    ...finish('Receipt'),
    'Reload the Done document; inspect its action toolbar.',
    click('View movement history'),
  ],
  'Edit draft and Cancel operation are absent; completed history shows the single +5 posting. API evidence covers attempted forced edits/cancellation.',
);
add(
  'DOC-15',
  [
    ...product('DOC15'),
    ...operation('Receipt', 'DOC15', 5),
    ...finish('Receipt'),
    click('Print'),
    'In the browser print preview, inspect reference, product, quantity and page boundaries.',
    'Click the print-dialog Cancel button to return without printing.',
  ],
  'Print preview contains the completed document; sidebar/navigation are excluded.',
  undefined,
  'Browser / print preview',
);
add(
  'DOC-16',
  [
    ...openReference('Receipts'),
    click('Print'),
    'In the browser print dialog choose the actual printer in Destination/Printer.',
    'Inspect the preview, then click the print-dialog Print button.',
    'Collect the printed pages; compare reference, product rows and quantities with the on-screen document.',
  ],
  'Physical pages are readable and complete; no app navigation is printed.',
  'A completed disposable receipt, its exact reference, a configured physical printer and paper.',
  'Manual printer',
);

add(
  'REC-01',
  [
    ...product('REC01'),
    ...operation('Receipt', 'REC01', 100),
    ...finish('Receipt'),
    ...stock('REC01'),
  ],
  'Status Done; On hand 100, Reserved 0, Available 100.',
);
add(
  'REC-02',
  [
    ...product('REC02', 10),
    ...operation('Receipt', 'REC02', 5),
    click('Confirm'),
    ...stock('REC02'),
    ...openReference('Receipts'),
    click('Validate'),
    ...stock('REC02'),
  ],
  'Confirm produces Ready with on hand still 10. Validate increases it to 15.',
);
add(
  'REC-04',
  [
    ...product('REC04', 0, 'Kilograms (kg)'),
    ...operation('Receipt', 'REC04', 0.3),
    ...finish('Receipt'),
    ...operation('Receipt', 'REC04', 0.2),
    ...finish('Receipt'),
    ...stock('REC04'),
  ],
  'On hand and Available are exactly 0.5 kg.',
);

add(
  'DEL-01',
  [
    ...product('DEL01', 100),
    ...operation('Delivery', 'DEL01', 20),
    ...finish('Delivery'),
    ...stock('DEL01'),
  ],
  'Done delivery; On hand 80, Reserved 0, Available 80.',
);
add(
  'DEL-03',
  [...product('DEL03', 2), ...operation('Delivery', 'DEL03', 5), click('Confirm')],
  'Status Waiting; shortage row highlighted; Check availability is shown. Record this reference for DEL-04.',
  'Complete SETUP-01. Use this fresh product only for the DEL-03/04 pair.',
);
add(
  'DEL-04',
  [
    ...operation('Receipt', 'DEL03', 3),
    ...finish('Receipt'),
    ...openReference('Deliveries', 'the waiting reference from DEL-03'),
    click('Check availability'),
    click('Mark as picked'),
    click('Mark as packed'),
    click('Validate'),
    ...stock('DEL03'),
  ],
  'Waiting becomes Ready after replenishment; delivery completes; final stock is zero.',
  'Complete DEL-03 first; keep its waiting delivery reference.',
);
add(
  'DEL-07',
  [
    ...product('DEL07', 10),
    ...operation('Delivery', 'DEL07', 7),
    click('Confirm'),
    'Label the saved reference A (Ready); do not pick or validate.',
    ...operation('Delivery', 'DEL07', 7),
    click('Confirm'),
    'Label this reference B (Waiting).',
    ...openReference('Deliveries', 'reference A'),
    ...cancel,
    ...openReference('Deliveries', 'reference B'),
    click('Check availability'),
    ...stock('DEL07'),
  ],
  'A cancellation releases its reservation; B becomes Ready. On hand 10, Reserved 7, Available 3.',
);
add(
  'DEL-08',
  [
    ...product('DEL08A', 10),
    ...product('DEL08B', 1),
    ...operation('Delivery', 'DEL08A', 5, { save: false }),
    click('Add product'),
    `Select ${q(name('DEL08B') + ' · ' + sku('DEL08B'))} in Product 2; set Quantity 2 to 5.`,
    click('Create draft'),
    click('Confirm'),
    ...stock('DEL08A'),
    ...stock('DEL08B'),
  ],
  'Whole delivery waits. Neither product is reserved: A has 10 available; B has 1.',
);
add(
  'DEL-09',
  [
    ...product('DEL09', 10),
    ...operation('Delivery', 'DEL09', 5),
    ...finish('Delivery'),
    click('View movement history'),
    'Check the delivery entry is -5 pcs.',
    ...stock('DEL09'),
  ],
  'Single outgoing -5 entry; On hand 5, Reserved 0, Available 5.',
);

add(
  'TRF-01',
  [
    ...product('TRF01', 100),
    ...operation('Transfer', 'TRF01', 30, { destination: rack }),
    ...finish('Transfer'),
    ...stock('TRF01'),
    ...stock('TRF01', rack),
  ],
  'QA Main has 70, QA Rack has 30; total remains 100.',
);
add(
  'TRF-02',
  [
    ...product('TRF02', 100),
    ...operation('Transfer', 'TRF02', 30, { destination: rack }),
    ...finish('Transfer'),
    click('View movement history'),
  ],
  'Exactly one -30 entry at QA Main and one +30 at QA Rack for this reference.',
);
add(
  'TRF-03',
  [
    ...product('TRF03', 10),
    ...operation('Transfer', 'TRF03', 1),
    'Read the same-location validation error in the form; click Close dialog, then Discard changes.',
  ],
  'Identical source and destination reject; stock remains 10.',
  undefined,
);
// A rejected create does not navigate to a reference page.
exact['TRF-03'].navigation = exact['TRF-03'].navigation.filter(
  (s) => !s.startsWith('Write down the generated reference'),
);
add(
  'TRF-04',
  [
    ...product('TRF04', 20),
    ...operation('Transfer', 'TRF04', 6, { destination: branch }),
    ...finish('Transfer'),
    ...stock('TRF04'),
    'Set the top-right Warehouse scope selector to QA Branch.',
    'Select QAB / QA Branch Stock in Stock location.',
    'Read the branch row; restore Warehouse scope to All warehouses.',
  ],
  'QA Main has 14; branch has 6; scoped branch view contains its own 6.',
);
add(
  'TRF-05',
  [
    ...product('TRF05', 100),
    ...operation('Transfer', 'TRF05', 30, { destination: rack }),
    ...finish('Transfer'),
    ...stock('TRF05', rack),
    'Reload the page.',
  ],
  'Destination stock remains 30 after reload.',
);
add(
  'TRF-06',
  [
    ...product('TRF06', 2),
    ...operation('Transfer', 'TRF06', 5, { destination: rack }),
    click('Confirm'),
    'Record the Waiting transfer reference.',
    ...operation('Receipt', 'TRF06', 3),
    ...finish('Receipt'),
    ...openReference('Internal transfers', 'the waiting transfer reference'),
    click('Check availability'),
    ...cancel,
    ...stock('TRF06'),
    ...stock('TRF06', rack),
  ],
  'Transfer waits, then reserves after replenishment. Cancellation releases reservation: source 5 available; destination 0.',
);

add(
  'ADJ-01',
  [
    ...product('ADJ01', 50),
    ...operation('Adjustment', 'ADJ01', 48),
    ...finish('Adjustment'),
    click('View movement history'),
    'Read the adjustment entry, then check Stock on hand filtered by QA-ADJ01-01.',
  ],
  'New total 48; signed adjustment is -2 pcs, not +48.',
);
add(
  'ADJ-02',
  [
    ...product('ADJ02', 9),
    ...operation('Adjustment', 'ADJ02', 0),
    ...finish('Adjustment'),
    ...stock('ADJ02'),
  ],
  'On hand, Reserved and Available all become 0; history contains -9.',
);
add(
  'ADJ-03',
  [
    ...product('ADJ03', 10),
    ...operation('Adjustment', 'ADJ03', 8),
    click('Confirm'),
    'Keep this count reference; do not Validate it yet.',
    ...operation('Receipt', 'ADJ03', 2),
    ...finish('Receipt'),
    ...openReference('Adjustments', 'the saved count reference'),
    click('Validate'),
    'Read the stock-changed/recount error.',
    ...stock('ADJ03'),
    ...openReference('Adjustments', 'the saved count reference'),
    ...cancel,
  ],
  'Stale count rejects; current on hand stays 12. Cancel the stale document and create a fresh count to continue.',
);
add(
  'ADJ-04',
  [
    ...product('ADJ04A', 10),
    ...product('ADJ04B', 10),
    ...operation('Delivery', 'ADJ04B', 8),
    click('Confirm'),
    ...operation('Adjustment', 'ADJ04A', 5, { save: false }),
    click('Add product'),
    `Select ${q(name('ADJ04B') + ' · ' + sku('ADJ04B'))} in Product 2; set Quantity 2 to 5.`,
    click('Create draft'),
    ...finish('Adjustment'),
    'Read the reservation-conflict error.',
    ...stock('ADJ04A'),
    ...stock('ADJ04B'),
  ],
  'Entire count fails: A stays 10/0/10; B stays 10/8/2 (on hand/reserved/available).',
);
add(
  'ADJ-05',
  [
    side('Adjustments'),
    'Inspect New adjustment: it is disabled.',
    side('Stock on hand'),
    'Inspect a stock row: the Update counted quantity clipboard action is absent.',
  ],
  'Staff cannot create physical counts from either entry point. API evidence covers forced HTTP requests.',
  'Signed in as active Warehouse staff.',
);
add(
  'ADJ-07',
  [
    ...product('ADJ07', 5),
    ...operation('Adjustment', 'ADJ07', 8),
    ...finish('Adjustment'),
    click('View movement history'),
    ...stock('ADJ07'),
  ],
  'Count entry is +3; new on hand is 8.',
);
add(
  'ADJ-08',
  [
    ...product('ADJ08', 8),
    ...operation('Adjustment', 'ADJ08', 8),
    ...finish('Adjustment'),
    ...stock('ADJ08'),
  ],
  'Document reaches Done; on hand remains 8 with no artificial increase/decrease.',
);

add(
  'RPT-01',
  [
    ...product('RPT01', 10),
    ...operation('Delivery', 'RPT01', 7),
    click('Confirm'),
    ...stock('RPT01'),
  ],
  'On hand 10, Reserved 7, Available 3.',
);
add(
  'RPT-02',
  [
    side('Settings'),
    click('Categories'),
    click('Add category'),
    set('Name', 'QA Thresholds 01'),
    click('Save category'),
    ...product('RPT02', 0, 'Pieces (pcs)', 'QA Thresholds 01'),
    ...rule('RPT02', 4, 12),
    ...stock('RPT02'),
    ...operation('Receipt', 'RPT02', 4),
    ...finish('Receipt'),
    ...stock('RPT02'),
    side('Overview'),
    'Select QA Thresholds 01 in All categories (Dashboard category).',
    'Under Replenishment watch locate QA RPT02 01: the suggested receipt is 8 pcs.',
    ...operation('Receipt', 'RPT02', 1),
    ...finish('Receipt'),
    ...stock('RPT02'),
  ],
  'At 0: Out of stock, suggest 12. At 4: Low stock, suggest 8. At 5: In stock, no replenishment alert.',
);
add(
  'RPT-03',
  [
    ...product('RPT03', 12),
    side('Stock on hand'),
    'Type qa-rpt03-01 in Search product name or SKU… (Search stock).',
    'In All categories (Stock category), choose QA Tests.',
    'In All locations (Stock location), choose QAT / QA Main.',
  ],
  'Only the matching QA RPT03 01 location row remains; matching is case-insensitive; balance is 12.',
);
const lifecycle = () => [
  ...product('LIFE01'),
  ...operation('Receipt', 'LIFE01', 100),
  ...finish('Receipt'),
  ...operation('Delivery', 'LIFE01', 20),
  ...finish('Delivery'),
  ...operation('Transfer', 'LIFE01', 30, { destination: rack }),
  ...finish('Transfer'),
  ...operation('Adjustment', 'LIFE01', 48),
  ...finish('Adjustment'),
];
add(
  'RPT-04',
  [...lifecycle(), ...stock('LIFE01'), 'Reload the page.', ...stock('LIFE01', rack)],
  'Main stock 48 and rack stock 30 persist. The full sequence is 100 received, 20 delivered, 30 transferred and main counted to 48.',
  'Complete SETUP-01. This is the full lifecycle recipe; run it once, then reuse its product for RPT-06.',
);
add(
  'RPT-05',
  [
    ...product('RPT05', 8),
    ...rule('RPT05', 10, 50),
    side('Stock on hand'),
    'Type QA-RPT05-01 in Search product name or SKU….',
    'Select QAT / QA Main in Stock location.',
    'Select Low stock in All stock levels (Stock availability).',
  ],
  'One matching row: On hand 8, Available 8, Low stock, Minimum 10.',
);
add(
  'RPT-06',
  [
    side('Move history'),
    'Type QA-LIFE01-01 in Search reference, contact, or product… (Search history).',
    'Set History operation type to All operations; History location to All locations; clear From and To.',
    "Read the Change column and each row's Location.",
  ],
  'The lifecycle has +100 receipt, -20 delivery, -30 main / +30 rack transfer, and -2 count.',
  'Complete RPT-04 first; Warehouse scope = All warehouses.',
);
add(
  'RPT-08',
  [
    side('Move history'),
    'In the From date field (History from date), enter 1 January 2000 using the browser date picker.',
    'In the To date field (History to date), enter 1 January 2001.',
    'Read the table/empty state; clear both date fields afterward.',
  ],
  'No movements found for an empty historical date range.',
  'Workspace records were created after 2001.',
);
add(
  'RPT-09',
  [
    side('Move history'),
    'Type QA-TRF04-01 in Search history.',
    'Set History operation type to Transfers.',
    'Set Warehouse scope at the top right to QA Branch.',
    'Set History location to All locations; inspect the rows. Restore Warehouse scope to All warehouses afterward.',
  ],
  'Only the branch +6 transfer side is visible.',
  'Complete TRF-04 first.',
);
add(
  'RPT-11',
  [
    side('Settings'),
    click('Categories'),
    click('Add category'),
    set('Name', 'QA Dashboard Counts 01'),
    click('Save category'),
    ...product('RPT11', 2, 'Pieces (pcs)', 'QA Dashboard Counts 01'),
    ...operation('Transfer', 'RPT11', 1, { destination: rack }),
    ...finish('Transfer'),
    ...rule('RPT11', 2, 5),
    side('Settings'),
    click('Reordering rules'),
    click('Add rule'),
    select('Product', name('RPT11') + ' · ' + sku('RPT11')),
    select('Location', rack),
    set('Minimum quantity', '2'),
    set('Target quantity', '5'),
    click('Save reordering rule'),
    side('Overview'),
    'Set All categories (Dashboard category) to QA Dashboard Counts 01 and All locations (Dashboard location) to All locations; compare the metrics and the two QA RPT11 01 location alerts.',
  ],
  'The dedicated category shows exactly one low-stock product and two location alerts.',
  'Complete SETUP-01; Warehouse scope = All warehouses. Use the dedicated category created by this case only for its one product.',
);
add(
  'RPT-13',
  [side('Overview'), 'In the top bar Search inventory… field, type QA-REC01-01.', 'Press Enter.'],
  'Stock on hand opens with QA-REC01-01 in Search stock.',
  'REC-01 completed; desktop window wide enough to show top-bar search.',
);
add(
  'RPT-14',
  [
    ...product('RPT14'),
    ...operation('Receipt', 'RPT14', 1, { save: false }),
    'Set Scheduled date to yesterday at 10:00 using its date/time picker.',
    click('Create draft'),
    side('Overview'),
    'In the Receipts operations card, click the clock badge reading N late (N is the current count).',
    'Read Showing overdue operations above the table; click its small X (Clear overdue filter).',
  ],
  'Late=true filter opens; clearing removes the banner and overdue-only filtering.',
);

add(
  'SEC-07',
  [
    'Open PowerShell and run: Set-Location -LiteralPath "C:\\WorkSpace\\Private\\StockSense"',
    'Run: Get-Content scripts/test-api.cjs -TotalCount 12',
    'Confirm the host, port and pathname checks occur before migrate, PrismaClient or TRUNCATE.',
    'Run: $env:TEST_DATABASE_URL="postgresql://invalid:invalid@127.0.0.1:55432/not_a_test_database"',
    'Run: node scripts/test-api.cjs',
    'Expect the Refusing to reset a database other than local stocksense_test:55432 error.',
    'Remove the temporary override: Remove-Item Env:TEST_DATABASE_URL',
  ],
  'The deliberate wrong URL is rejected before migrations or destructive SQL. No valid credentials or real database are supplied.',
  'A separate PowerShell process; no running test suite; never change the .env file for this check.',
  'Manual developer check',
);
add(
  'SEC-08',
  [
    'Ask the database operator to prepare an isolated restore database; do not restore over stocksense or stocksense_test.',
    'Use the project PostgreSQL pg_dump utility with the test database connection to create a custom-format dump (-Fc).',
    'Use pg_restore with --exit-on-error and the isolated restore connection to load that dump.',
    'Compare counts for User, Product, StockBalance, Operation and LedgerEntry in source and clone, then compare sum(delta) grouped by productId/locationId to StockBalance.onHand in the clone.',
    'Record dump path, PostgreSQL version, elapsed time and all differences.',
  ],
  'Clone reproduces the test stock/history and every ledger sum reconciles.',
  'Database operator must provide isolated source/target connection details. There is no Backup/Restore screen or button in this app.',
  'Manual infrastructure',
);
add(
  'SEC-09',
  [
    ...product('SEC09'),
    ...operation('Receipt', 'SEC09', 3),
    ...finish('Receipt'),
    'Record the Done reference and on-hand quantity 3.',
    'In the terminal running this test app, press Ctrl+C once. From the project PowerShell terminal run npm run local:stop, then npm run local:start, then npm run dev.',
    'Open http://127.0.0.1:5173/ and sign in if requested.',
    ...stock('SEC09'),
    ...openReference('Receipts'),
  ],
  'Stock stays 3 and the receipt stays Done after the restart.',
  'Coordinate downtime first: these commands stop this StockSense local API/database. Run only when nobody else is testing.',
  'Manual restart',
);
add(
  'SEC-10',
  [
    'Provision a separate load-test deployment and a developer-supplied load harness; do not target the current demo.',
    'Have the harness authenticate multiple disposable accounts and issue receipt, delivery reservation, transfer and count workflows concurrently for the agreed duration.',
    'Capture latency/error percentiles and reconcile ledger sums and stock/reservation invariants at the end.',
    'Record concurrency, duration, throughput and any failed operations.',
  ],
  'No negative availability, duplicate posting or ledger mismatch; measured performance is documented.',
  'No load harness or benchmark environment exists in the delivered app. This case is a pending engineering exercise, not a clickable UI test.',
  'Manual infrastructure',
);
add(
  'SEC-11',
  [
    'Open the same reachable test app URL in Microsoft Edge; complete AUTH-01, AUTH-06, AUTH-12, AUTH-13 and MAIL-03.',
    'Complete CAT-09, DOC-12, DEL-03/04, TRF-01, ADJ-03 and RPT-04 using fresh QA suffixes.',
    'Repeat in Firefox. On a macOS/iOS device with a reachable test deployment, repeat in Safari.',
    'Record browser/OS versions and the exact case ID of each discrepancy.',
  ],
  'Equivalent authentication, navigation and stock behavior across browsers.',
  'Installed browsers; Safari requires an Apple device or suitable test environment. Do not use localhost on another device as if it were this PC.',
  'Manual cross-browser',
);
add(
  'SEC-12',
  [
    'Obtain the actual HTTPS deployment URL and deployment configuration from its operator.',
    'In Chrome/Edge open the site; press F12, open Application > Storage > Cookies, and inspect stocksense_session after sign-in.',
    'Verify Secure, HttpOnly and SameSite=Strict; use Network to confirm HTTPS requests and no mixed content.',
    'Have the operator inspect firewall/database exposure, secret storage, monitoring and a proven backup/restore procedure.',
    'Record environment-specific evidence; do not mark the local HTTP development build as an HTTPS production pass.',
  ],
  'Deployment controls are verified against the real environment before public use.',
  'No public HTTPS deployment is included. There is no Publish or Security settings button in this app.',
  'Manual infrastructure',
);

// These scenarios depend on HTTP payloads, races, mocks or database assertions that the UI cannot reproduce faithfully.
const technicalIds = [
  'AUTH-05',
  'AUTH-09',
  'AUTH-14',
  'AUTH-15',
  'AUTH-18',
  'AUTH-21',
  'MAIL-04',
  'MAIL-11',
  'MAIL-13',
  'NAV-11',
  'NAV-15',
  'CAT-16',
  'CAT-20',
  'DOC-04',
  'DOC-05',
  'DOC-07',
  'DOC-08',
  'DOC-09',
  'DOC-10',
  'DOC-11',
  'REC-03',
  'REC-05',
  'REC-06',
  'DEL-02',
  'DEL-05',
  'DEL-06',
  'ADJ-06',
  'RPT-07',
  'RPT-10',
  'RPT-12',
  'SEC-01',
  'SEC-02',
  'SEC-03',
  'SEC-04',
  'SEC-05',
  'SEC-06',
];
function applyNavigation(groups) {
  const evidence = require('../docs/test-execution.json').tests;
  for (const c of groups.flatMap((g) => g.cases)) {
    if (technicalIds.includes(c.id)) {
      const [kind, fragment] = c.evidence.split(':');
      const test = evidence.find((t) => t.kind === kind && t.name.includes(fragment));
      if (!test) throw new Error('No exact executable test for ' + c.id);
      const pattern = test.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "''");
      const command =
        kind === 'API'
          ? `npm run test -w @stocksense/api -- -t '${pattern}'`
          : `npm run test:e2e -- --grep '${pattern}'`;
      add(
        c.id,
        [
          'There is no app button that faithfully performs this check. Use the named automated test; it supplies the exact invalid requests, concurrency or mocked failure.',
          'Open PowerShell. Run: Set-Location -LiteralPath "C:\\WorkSpace\\Private\\StockSense"',
          'Ensure no other API/browser test is running. Run: npm run local:start',
          'Run exactly: ' + command,
          `Read the result for ${q(test.name)}. It must say PASS; other tests may be skipped by the name filter.`,
          "This scenario's assertion is: " + c.expected,
        ],
        c.expected,
        'Developer check; dependencies installed; local PostgreSQL/Mailpit available. The runner resets only stocksense_test, never the normal demo inventory. Do not run two suites together.',
        kind === 'API' ? 'Terminal / API' : 'Terminal / browser automation',
      );
    }
    if (!exact[c.id]) throw new Error('Missing exact navigation for ' + c.id);
    Object.assign(c, exact[c.id]);
  }
  const known = new Set(groups.flatMap((g) => g.cases.map((c) => c.id)));
  for (const id of Object.keys(exact)) if (!known.has(id)) throw new Error('Unknown case ' + id);
  return groups;
}
module.exports = { applyNavigation };
