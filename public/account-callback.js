// Email sign-in links can land on the homepage. Finish sign-in on the dashboard.
if (location.pathname === '/' && location.hash.includes('access_token=')) {
  location.replace('/dashboard' + location.hash);
}
