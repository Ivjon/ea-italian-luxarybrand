// Messages the store's customers can see, in Albanian. The store page sends its language in an X-Lang header (sq / en;
// see frontend/i18n.js); the CRM sends none, so it stays in English. As in the page, the English text is the key, and
// messages with a value in them (a field, a number, a product) are matched by pattern.
const SQ = {
  // Sign-in, sign-up, account
  'Please sign in to see your account.': 'Ju lutemi hyni për të parë llogarinë tuaj.',
  'The username, email or password is not correct.': 'Emri i përdoruesit, email-i ose fjalëkalimi nuk është i saktë.',
  'Too many attempts. Please wait 15 minutes and try again.': 'Shumë përpjekje. Ju lutemi prisni 15 minuta dhe provoni përsëri.',
  'The two passwords are not the same.': 'Dy fjalëkalimet nuk përputhen.',
  'Please accept the terms and conditions.': 'Ju lutemi pranoni kushtet e përdorimit.',
  'An account with this email already exists. Sign in instead.': 'Ekziston tashmë një llogari me këtë email. Hyni në të.',
  'This username is taken. Please choose another one.': 'Ky emër përdoruesi është i zënë. Ju lutemi zgjidhni një tjetër.',
  'Please enter a valid email.': 'Ju lutemi shkruani një email të vlefshëm.',
  'Please enter a valid phone number.': 'Ju lutemi shkruani një numër telefoni të vlefshëm.',
  'Usernames are 3–30 letters, numbers, dots, dashes or underscores.': 'Emri i përdoruesit duhet të ketë 3–30 shkronja, numra, pika, viza ose nënvija.',
  // Newsletter, Find a store, contact
  'You are already on our list; your details are updated.': 'Jeni tashmë në listën tonë; të dhënat tuaja u përditësuan.',
  'Welcome to EA Luxury. You will hear from us soon.': 'Mirë se vini në EA Luxury. Do të dëgjoni nga ne së shpejti.',
  'Your message has been received.': 'Mesazhi juaj u mor.',
  'Thank you. A client advisor will contact you to arrange your visit.': 'Faleminderit. Një këshilltar klientësh do t’ju kontaktojë për të caktuar vizitën tuaj.',
  // Track an order
  'We could not find an order with these details. Check the order number and use the first and last name given at checkout.': 'Nuk gjetëm asnjë porosi me këto të dhëna. Kontrolloni numrin e porosisë dhe përdorni emrin dhe mbiemrin e dhënë gjatë blerjes.',
  // Changing an order from My account
  'Order not found.': 'Porosia nuk u gjet.',
  'This order has already shipped, so its address can no longer change.': 'Kjo porosi është nisur tashmë, ndaj adresa nuk mund të ndryshohet më.',
  // Checkout
  'Your bag is empty.': 'Shporta juaj është bosh.',
  'A piece in your bag is no longer available. Please remove it and try again.': 'Një artikull në shportën tuaj nuk është më i disponueshëm. Ju lutemi hiqeni dhe provoni përsëri.',
  'Please choose a delivery option.': 'Ju lutemi zgjidhni një mënyrë dorëzimi.',
  'Please choose a payment method.': 'Ju lutemi zgjidhni një mënyrë pagese.',
  'Standard delivery': 'Dorëzim standard',
  'Express delivery': 'Dorëzim i shpejtë',
  '3–5 business days': '3–5 ditë pune',
  '1–2 business days': '1–2 ditë pune',
  'Cash on delivery': 'Pagesë në dorëzim',
  'Pay the courier when your order arrives.': 'Paguani korrierin kur t’ju mbërrijë porosia.',
  'Bank transfer': 'Transfertë bankare',
  'A client advisor will send you the bank details. Your order ships once the payment arrives.': 'Një këshilltar klientësh do t’ju dërgojë të dhënat bankare. Porosia juaj niset sapo të mbërrijë pagesa.',
  // General
  'Not found.': 'Nuk u gjet.',
  'Method not allowed.': 'Veprim i palejuar.',
  'Request body is too large.': 'Kërkesa është shumë e madhe.',
  'Request body must be a JSON object.': 'Kërkesa nuk është e vlefshme.',
  'Something went wrong on the server.': 'Ndodhi një gabim në server. Ju lutemi provoni përsëri.',
};
// Field names inside messages ("First name is required.").
const LABELS = {
  'Full name': 'Emri i plotë', Name: 'Emri', Email: 'Email', Phone: 'Telefoni', Username: 'Emri i përdoruesit',
  'First name': 'Emri', 'Last name': 'Mbiemri', Address: 'Adresa', 'Apartment, suite, floor': 'Apartamenti, hyrja, kati',
  'Postal code': 'Kodi postar', City: 'Qyteti', Country: 'Shteti', 'Order note': 'Shënimi për porosinë',
  'Order number': 'Numri i porosisë',
};
const label = l => LABELS[l] || l;
const PATTERNS = [
  [/^(.+) is required\.$/, m => `Fusha „${label(m[1])}“ është e detyrueshme.`],
  [/^(.+) must be (\d+) characters or fewer\.$/, m => `Fusha „${label(m[1])}“ mund të ketë deri në ${m[2]} karaktere.`],
  [/^Choose a password of at least (\d+) characters\.$/, m => `Zgjidhni një fjalëkalim me të paktën ${m[1]} karaktere.`],
  [/^An order can hold up to (\d+) pieces\.$/, m => `Një porosi mund të ketë deri në ${m[1]} artikuj.`],
  [/^Please choose a size for (.+)\.$/, m => `Ju lutemi zgjidhni një masë për ${m[1]}.`],
  [/^Only (\d+) left of (.+) in size (.+)\. Please update your bag\.$/, m => `${m[1] === '1' ? 'Ka mbetur' : 'Kanë mbetur'} vetëm ${m[1]} copë nga ${m[2]} në masën ${m[3]}. Ju lutemi përditësoni shportën.`],
  [/^Only (\d+) left of (.+)\. Please update your bag\.$/, m => `${m[1] === '1' ? 'Ka mbetur' : 'Kanë mbetur'} vetëm ${m[1]} copë nga ${m[2]}. Ju lutemi përditësoni shportën.`],
  [/^(.+) in size (.+) has just sold out\. Please remove it from your bag\.$/, m => `${m[1]} në masën ${m[2]} sapo mbaroi. Ju lutemi hiqeni nga shporta.`],
  [/^(.+) has just sold out\. Please remove it from your bag\.$/, m => `${m[1]} sapo mbaroi. Ju lutemi hiqeni nga shporta.`],
];

const langOf = req => (/^sq\b/i.test(String(req.headers['x-lang'] || '')) ? 'sq' : 'en');
function tr(lang, msg) {
  if (lang !== 'sq' || typeof msg !== 'string') return msg;
  if (SQ[msg] !== undefined) return SQ[msg];
  for (const [re, f] of PATTERNS) { const m = re.exec(msg); if (m) return f(m); }
  return msg;
}
// "Standard delivery, 3–5 business days": each part on its own.
const trParts = (lang, s) => (typeof s === 'string' ? s.split(', ').map(p => tr(lang, p)).join(', ') : s);

module.exports = { langOf, tr, trParts };
