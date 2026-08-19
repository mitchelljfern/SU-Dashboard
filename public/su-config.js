// Supabase connection for the SU dashboard.
//
// The publishable key is meant to ship in the browser — it grants nothing on
// its own. Every table is behind row-level security, so what a signed-in user
// can read or write is decided by the database, not by this file. Never put
// the service_role key here.
//
// `site` is where invitation and password-reset links land. It is pinned
// rather than taken from whatever page sent the invitation: an admin working
// on a local copy was minting links that pointed at their own localhost, which
// is a dead end for everybody who received one. It must also appear in
// Supabase under Authentication -> URL Configuration, or GoTrue drops it.
window.SU_CONFIG = {
  url: 'https://tiefkbutqnrttpdcsmiy.supabase.co',
  key: 'sb_publishable_xwAeqhN3tDkUe3CANbH38Q_-9EKwhdF',
  site: 'https://dashboard.socialupgrades.com'
};
