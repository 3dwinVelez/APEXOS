// Reuses the complete real termination/benefits regression before exercising all redesigned workspaces.
process.env.HR_WORKSPACE_MOCKUP_CERT='1';
process.env.CERT_BROWSER_PORT ||= '3321';
require('./hr-termination-complete-local');
