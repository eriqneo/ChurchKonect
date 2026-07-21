routerAdd("POST", "/api/churchconnect/provision-member-account", (e) => {
  let auth = e.auth;
  let body = e.requestInfo().body || {};
  let memberId = String(body.memberId || "").trim();
  let response = { ok: false, code: "unknown_error", message: "The account could not be provisioned." };
  let status = 500;

  if (!auth) {
    return e.json(401, { ok: false, code: "auth_required", message: "Sign in before provisioning a login account." });
  }

  let actorRole = String(auth.get("role") || "");
  if (actorRole !== "administrator" && actorRole !== "lead_pastor") {
    return e.json(403, { ok: false, code: "leadership_required", message: "Only Administrators and the Lead Pastor can provision login accounts." });
  }

  if (!memberId) {
    return e.json(400, { ok: false, code: "member_required", message: "Choose a registry profile first." });
  }

  try {
    let member = e.app.findRecordById("members", memberId);
    let email = String(member.get("email") || "").trim().toLowerCase();
    let role = String(member.get("role") || "");
    let linkedUser = String(member.get("user") || "");
    let fullName = String(member.get("fullName") || "").trim();
    let statusValue = String(member.get("status") || "");
    let deleted = member.getBool("deleted");

    if (!fullName || !email || !role) {
      return e.json(400, { ok: false, code: "profile_incomplete", message: "The registry profile needs a name, email, and role before a login account can be provisioned." });
    }

    if (linkedUser) {
      return e.json(409, { ok: false, code: "already_linked", message: "This registry profile is already linked to a login account." });
    }

    if (statusValue !== "active" || deleted) {
      return e.json(409, { ok: false, code: "inactive_member", message: "Only active, non-archived registry profiles can receive login accounts." });
    }

    if ((role === "administrator" || role === "lead_pastor") && actorRole !== "lead_pastor") {
      return e.json(403, { ok: false, code: "protected_role", message: "Only the Lead Pastor can provision Administrator or Lead Pastor login accounts." });
    }

    try {
      let existing = e.app.findAuthRecordByEmail("users", email);
      if (existing) {
        return e.json(409, { ok: false, code: "email_exists", message: "A login account already exists for this email. Link the existing account instead." });
      }
    } catch (_) {
      // No existing auth record with this email.
    }

    let password = "Cc!" + $security.randomString(21);
    let provisioned = {};

    e.app.runInTransaction((txApp) => {
      let usersCollection = txApp.findCollectionByNameOrId("users");
      let account = new Record(usersCollection);
      account.setEmail(email);
      account.setPassword(password);
      account.setVerified(true);
      account.set("name", fullName);
      account.set("role", role);
      account.set("avatarText", String(member.get("avatarText") || ""));
      account.set("department", "");
      account.set("status", "active");
      txApp.save(account);

      let txMember = txApp.findRecordById("members", memberId);
      txMember.set("user", account.id);
      txApp.save(txMember);

      let auditCollection = txApp.findCollectionByNameOrId("audit_logs");
      let audit = new Record(auditCollection);
      let operationId = $security.randomString(15).toLowerCase();
      audit.set("actor", auth.id);
      audit.set("actorName", String(auth.get("name") || auth.get("email") || "ChurchConnect"));
      audit.set("action", "member_account_provisioned");
      audit.set("summary", "Provisioned a login account for " + fullName + ".");
      audit.set("entityType", "member");
      audit.set("entityId", memberId);
      audit.set("source", "server");
      audit.set("operationId", operationId);
      txApp.save(audit);

      provisioned = {
        userId: account.id,
        memberId: memberId,
        email: email,
        fullName: fullName,
        role: role,
        temporaryPassword: password
      };
    });

    return e.json(201, { ok: true, account: provisioned });
  } catch (error) {
    console.log("[hooks] provision-member-account failed:", error);
    return e.json(status, response);
  }
}, $apis.requireAuth("users"));
