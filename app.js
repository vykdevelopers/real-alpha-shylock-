  $("#loanForm").addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const message = $("#loanMsg");
    clear(message);

    if (!currentUser) {
      show(message, "Please create an account or sign in through Portal before applying.", "err");
      $("#portal").scrollIntoView({behavior:"smooth"});
      return;
    }

    const amount = Number($("#loanAmount").value);

    if (!Number.isFinite(amount) || amount < 5000 || amount > 50000 || amount % 500 !== 0) {
      $("#loanAmount").setCustomValidity("Enter an amount from KSh 5,000 to KSh 50,000 in steps of KSh 500.");
      $("#loanAmount").reportValidity();
      $("#loanAmount").addEventListener("input", () => $("#loanAmount").setCustomValidity(""), {once:true});
      return;
    }

    if (!phoneOk($("#phone").value)) {
      $("#phone").setCustomValidity("Enter a valid Kenyan mobile number.");
      $("#phone").reportValidity();
      $("#phone").addEventListener("input", () => $("#phone").setCustomValidity(""), {once:true});
      return;
    }

    if (!phoneOk($("#guarantorPhone").value)) {
      $("#guarantorPhone").setCustomValidity("Enter a valid Kenyan mobile number for the guarantor.");
      $("#guarantorPhone").reportValidity();
      $("#guarantorPhone").addEventListener("input", () => $("#guarantorPhone").setCustomValidity(""), {once:true});
      return;
    }

    if ($("#phone").value.trim() === $("#guarantorPhone").value.trim()) {
      show(message, "The guarantor's phone number must differ from yours.", "err");
      return;
    }

    if (!/^\d{6,10}$/.test($("#idNumber").value.trim())) {
      show(message, "Enter a valid National ID number (digits only).", "err");
      return;
    }

    if (!form.reportValidity()) return;

    for (const id of ["passportPhoto", "idFront", "idBack"]) {
      const error = imageError($("#" + id));
      if (error) return show(message, error, "err");
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Submitting securely…";

    try {
      const reference = "RAS-" + crypto.randomUUID().slice(0, 8).toUpperCase();
      const folder = `${currentUser.id}/${reference}`;

      const files = {
        passport: $("#passportPhoto").files[0],
        id_front: $("#idFront").files[0],
        id_back: $("#idBack").files[0]
      };

      const paths = {};

      for (const [key, file] of Object.entries(files)) {
        const ext = file.type === "image/png" ? "png" :
          file.type === "image/webp" ? "webp" : "jpg";

        paths[key] = await uploadPrivateDocument(
          file,
          `${folder}/${key}.${ext}`
        );
      }

      const payload = {
        applicant_id: currentUser.id,
        reference,
        full_name: $("#fullName").value.trim(),
        email: $("#email").value.trim().toLowerCase(),
        phone: $("#phone").value.trim(),
        national_id: $("#idNumber").value.trim(),
        loan_amount: amount,
        loan_type: $("#loanType").value,
        marital_status: $("#maritalStatus").value,
        spouse_name: $("#spouseName").value.trim() || null,
        guarantor_name: $("#guarantorName").value.trim(),
        guarantor_phone: $("#guarantorPhone").value.trim(),
        purpose_details: $("#purposeDetails").value.trim(),
        passport_path: paths.passport,
        id_front_path: paths.id_front,
        id_back_path: paths.id_back
      };

      const { error } = await client
        .from("loan_applications")
        .insert(payload);

      if (error) throw error;

      show(message, `Application ${reference} was submitted successfully. Sign in later to track its status.`, "ok");

      form.reset();
      syncSpouse();
      await loadMyApplications();

    } catch (error) {
      console.error(error);
      show(message, error.message || "Could not submit the application. Check your connection and Supabase setup.", "err");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit application";
    }
  });

  async function loadStaffApplications() {
    if (!currentUser || !isStaff) return;

    const box = $("#staffRows");
    const message = $("#staffMsg");
    clear(message);
    box.textContent = "Loading applications…";

    let query = client.from("loan_applications")
      .select("id,reference,full_name,email,phone,loan_amount,loan_type,status,created_at,passport_path,id_front_path,id_back_path")
      .order("created_at", {ascending:false});

    const filter = $("#staffFilter").value;
    if (filter) query = query.eq("status", filter);

    const { data, error } = await query;

    if (error) {
      box.textContent = "";
      return show(message, error.message, "err");
    }

    if (!data.length) {
      box.textContent = "No applications found.";
      return;
    }

    const table = document.createElement("table");
    table.style.width = "100%";
    table.innerHTML = "<thead><tr><th>Reference</th><th>Applicant</th><th>Loan</th><th>Status</th><th>Documents</th><th>Update</th></tr></thead>";

    const tbody = document.createElement("tbody");

    for (const app of data) {
      const tr = document.createElement("tr");
      const docs = [];

      for (const [label, path] of [
        ["Passport", app.passport_path],
        ["ID front", app.id_front_path],
        ["ID back", app.id_back_path]
      ]) {
        if (!path) continue;

        const { data: signed, error: signedError } = await client.storage
          .from("loan-documents")
          .createSignedUrl(path, 60);

        if (!signedError && signed?.signedUrl) {
          docs.push(`<a href="${escapeHtml(signed.signedUrl)}" target="_blank" rel="noopener">${label}</a>`);
        }
      }

      tr.innerHTML = `
        <td>${escapeHtml(app.reference)}<br><small>${new Date(app.created_at).toLocaleDateString()}</small></td>
        <td>${escapeHtml(app.full_name)}<br><small>${escapeHtml(app.email)} · ${escapeHtml(app.phone)}</small></td>
        <td>${escapeHtml(app.loan_type)}<br><strong>${fmt(app.loan_amount)}</strong></td>
        <td>${escapeHtml(app.status)}</td>
        <td>${docs.join(" · ") || "No links"}</td>
        <td><select aria-label="Update status for ${escapeHtml(app.reference)}" data-app-id="${escapeHtml(app.id)}">
          ${["Pending","Under Review","Approved","Rejected"].map(status =>
            `<option ${status===app.status?"selected":""}>${status}</option>`
          ).join("")}
        </select></td>`;

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    box.replaceChildren(table);

    box.querySelectorAll("select[data-app-id]").forEach(select => {
      select.addEventListener("change", async () => {
        const { error } = await client.from("loan_applications")
          .update({status:select.value})
          .eq("id", select.dataset.appId);

        if (error) show(message, error.message, "err");
        else show(message, "Application status updated.", "ok");
      });
    });
  }

  $("#refreshStaff").addEventListener("click", loadStaffApplications);
  $("#staffFilter").addEventListener("change", loadStaffApplications);

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    setTimeout(() => refreshSession(), 0);
  });

  refreshSession();
})();
