# Support And Rollback

Canonical scripts are shipped at `apps/api/scripts/certifications/` and exposed through compatible root wrappers. CI builds the API image and parses all three artifact files. Production must execute the two scripts from its deployed container; any nonzero exit, commit mismatch, permission leak, persistence failure or transversal regression requires Railway rollback to `268d900c0dc17f8f51552c1f8b68fd820a30c1c4` or the last verified healthy deployment.
