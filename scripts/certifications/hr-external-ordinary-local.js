// Complete shared payroll/termination regression followed by the real Excel import reproduction.
process.env.HR_EXTERNAL_ORDINARY_CERT='1';
process.env.CERT_BROWSER_PORT ||= '3321';
require('./hr-termination-complete-local');
