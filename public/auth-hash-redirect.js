// Email sign-in links can land on the homepage; finish them on the account page.
// External file so the site's script-src 'self' policy allows it.
if (location.hash.includes('access_token=')) location.replace('/account' + location.hash);
