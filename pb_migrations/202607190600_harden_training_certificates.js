migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const certificates = app.findCollectionByNameOrId('training_certificates');
  certificates.fields.add(new TextField({ name: 'verifierName', max: 120 }));
  certificates.fields.add(new TextField({ name: 'verifierRole', max: 40 }));
  certificates.createRule = `${authenticated} && requestedBy = @request.auth.id && ((@request.auth.role = "administrator" && status = "pending" && verifiedBy = "" && verifiedAt = "" && verifierName = "" && verifierRole = "") || (@request.auth.role = "lead_pastor" && status = "verified" && verifiedBy = @request.auth.id && verifiedAt != "" && verifierName = @request.auth.name && verifierRole = @request.auth.role))`;
  certificates.updateRule = `${authenticated} && @request.auth.role = "lead_pastor" && status = "pending" && verifiedBy = "" && @request.body.status = "verified" && @request.body.verifiedBy = @request.auth.id && @request.body.verifiedAt != "" && @request.body.verifierName = @request.auth.name && @request.body.verifierRole = @request.auth.role && @request.body.training:changed = false && @request.body.member:changed = false && @request.body.certificateNumber:changed = false && @request.body.attendanceRate:changed = false && @request.body.issuedAt:changed = false && @request.body.requestedBy:changed = false`;
  app.save(certificates);
}, (app) => {
  const authenticated = '@request.auth.id != ""';
  const certificates = app.findCollectionByNameOrId('training_certificates');
  certificates.fields.removeByName('verifierName');
  certificates.fields.removeByName('verifierRole');
  certificates.createRule = `${authenticated} && (@request.auth.role = "lead_pastor" || (@request.auth.role = "administrator" && status = "pending" && verifiedBy = ""))`;
  certificates.updateRule = `${authenticated} && @request.auth.role = "lead_pastor" && @request.body.training:changed = false && @request.body.member:changed = false && @request.body.certificateNumber:changed = false && @request.body.requestedBy:changed = false`;
  app.save(certificates);
});
