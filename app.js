 /* Real Alpha Shylock Loan — Supabase integration */
"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);
  const cfg = window.SUPABASE_CONFIG || {};
  const fmt = (n) => "KSh " + Number(n).toLocaleString("en-KE");
  const supabaseReady = Boolean(window.supabase && cfg.url && cfg.publishableKey);
  const client = supabaseReady
    ? window.supabase.createClient(cfg.url, cfg.publishableKey)
    : null;

  const show = (node, message, kind = "ok") => {
    if (!node) return;
    node.textContent = message;
    node.className = "msg show " + kind;
  };

  const clear = (node) => {
    if (!node) return;
    node.textContent = "";
    node.className = "msg";
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[ch]);

  if (!supabaseReady) {
    show($("#authMsg"), "Supabase configuration could not be loaded. Check supabase-config.js.", "err");
    return;
  }

  $("#year").textContent = new Date().getFullYear();

  $("#portalBtn").addEventListener("click", () =>
    $("#portal").scrollIntoView({behavior:"smooth"})
  );

  const amountSlider = $("#amt");
  const amountOutput = $("#amtOut");

  amountSlider.addEventListener("input", () =>
    amountOutput.textContent = fmt(amountSlider.value)
  );

  $("#useAmt").addEventListener("click", () =>
    $("#loanAmount").value = amountSlider.value
  );

  document.querySelectorAll("[data-type]").forEach(link => {
    link.addEventListener("click", () =>
      $("#loanType").value = link.dataset.type
    );
  });

  const marital = $("#maritalStatus");
  const spouse = $("#spouseName");

  const syncSpouse = () => {
    const married = marital.value === "Married";
    spouse.disabled = !married;
    spouse.required = married;
    if (!married) spouse.value = "";
  };

  marital.addEventListener("change", syncSpouse);
  syncSpouse();

  const phoneOk = value => /^(?:\+254|0)[17]\d{8}$/.test(value.trim());

  const imageError = input => {
    const file = input.files?.[0];
    const label = input.labels?.[0]?.textContent.replace(/\*/g, "").trim() || "file";

    if (!file) return "Please select " + label + ".";
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return label + " must be JPG, PNG or WebP.";
    if (file.size > 5 * 1024 * 1024)
      return label + " must be 5 MB or smaller.";

    return "";
  };

  let currentUser = null;
  let isStaff = false;

  const authMessage = $("#authMsg");
  const authForm = $("#authForm");
  let authMode = "login";

  document.querySelectorAll("[data-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      authMode = tab.dataset.tab;
      const registering = authMode === "register";

      document.querySelectorAll("[data-tab]").forEach(item => {
        item.classList.toggle("on", item === tab);
        item.setAttribute("aria-selected", String(item === tab));
      });

      $("#nameWrap").classList.toggle("hidden", !registering);
      $("#authName").required = registering;
      $("#confirmWrap").classList.toggle("hidden", !registering);
      $("#confirmPassword").required = registering;
      $("#authBtn").textContent = registering ? "Create account" : "Login";
      $("#authPassword").autocomplete = registering ? "new-password" : "current-password";

      clear(authMessage);
    });
  });

  authForm.addEventListener("submit", async event => {
    event.preventDefault();
    clear(authMessage);

    if (!authForm.reportValidity()) return;

    const email = $("#authEmail").value.trim().toLowerCase();
    const password = $("#authPassword").value;

    try {
      if (authMode === "register") {
        if (password !== $("#confirmPassword").value) {
          return show(authMessage, "The passwords do not match.", "err");
        }

        const fullName = $("#authName").value.trim();

        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } }
        });

        if (error) throw error;

        if (data.session) {
          show(authMessage, "Account created and signed in successfully.", "ok");
        } else {
          show(authMessage, "Account created. Check your email for the confirmation link, then sign in.", "ok");
        }

        authForm.reset();
        document.querySelector('[data-tab="login"]').click();

      } else {
        const { error } = await client.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        authForm.reset();
        show(authMessage, "You are signed in.", "ok");
      }

    } catch (error) {
      show(authMessage, error.message || "Authentication failed.", "err");
    }
  });

  async function refreshSession() {
    const { data, error } = await client.auth.getSession();

    if (error) console.error(error);

    currentUser = data.session?.user || null;
    isStaff = false;

    if (currentUser) {
      const { data: roleRows, error: roleError } = await client
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUser.id);

      if (!roleError) {
        isStaff = (roleRows || []).some(row =>
          ["admin", "staff"].includes(row.role)
        );
      }
    }

    renderAccountState();
  }

  function renderAccountState() {
    const message = $("#authMsg");

    if (!currentUser) {
      $("#staffPanel").classList.add("hidden");
      $("#authBtn").disabled = false;
      $("#authBtn").type = "submit";
      $("#authBtn").onclick = null;
      $("#authBtn").textContent = authMode === "register" ? "Create account" : "Login";
      return;
    }

    const name = currentUser.user_metadata?.full_name || currentUser.email;

    show(message, "Signed in as " + name + ". You can now submit an application.", "ok");

    $("#authBtn").textContent = "Sign out";
    $("#authBtn").type = "button";

    $("#authBtn").onclick = async () => {
      const { error } = await client.auth.signOut();

      if (error) {
        show(message, error.message, "err");
      } else {
        currentUser = null;
        isStaff = false;
        $("#authBtn").type = "submit";
        $("#authBtn").onclick = null;
        $("#authBtn").textContent = authMode === "register" ? "Create account" : "Login";
        $("#staffPanel").classList.add("hidden");
        show(message, "You have signed out.", "ok");
      }
    };

    if (isStaff) {
      $("#staffPanel").classList.remove("hidden");
      loadStaffApplications();
    } else {
      $("#staffPanel").classList.add("hidden");
    }

    loadMyApplications();
  }

  async function loadMyApplications() {
    if (!currentUser) return;

    const { data, error } = await client
      .from("loan_applications")
      .select("reference,loan_type,loan_amount,status,created_at")
      .eq("applicant_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Could not load application history:", error.message);
      return;
    }

    const existing = $("#myApplications");
    if (existing) existing.remove();

    const list = document.createElement("div");
    list.id = "myApplications";
    list.className = "note";
    list.innerHTML = "<strong>Your applications</strong>";

    if (!data.length) {
      list.insertAdjacentHTML("beforeend", "<p>You have not submitted an application yet.</p>");
    } else {
      const ul = document.createElement("ul");

      data.forEach(app => {
        const li = document.createElement("li");
        li.textContent = `${app.reference} · ${app.loan_type} · ${fmt(app.loan_amount)} · ${app.status}`;
        ul.appendChild(li);
      });

      list.appendChild(ul);
    }

    $("#authForm").after(list);
  }

  async function uploadPrivateDocument(file, path) {
    const { error } = await client.storage
      .from("loan-documents")
      .upload(path, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: "3600"
      });

    if (error) throw error;
    return path;
  } $("#loanForm").addEventListener("submit", async event => {
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
