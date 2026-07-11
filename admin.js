/* =========================================================
   PANEL ADMINISTRATIVO - Ortopédico Mundo Vital
   ========================================================= */
const $ = (s) => document.querySelector(s);

let productsCache = [];

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

const money = (n) => "$ " + Number(n || 0).toLocaleString("es-CO");

/* =========================================================
   AUTENTICACIÓN
   ========================================================= */
async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) showDashboard(data.session.user);
  else showLogin();
}

function showLogin() {
  $("#loginScreen").style.display = "grid";
  $("#dashboard").style.display = "none";
}

function showDashboard(user) {
  $("#loginScreen").style.display = "none";
  $("#dashboard").style.display = "block";
  $("#adminEmail").textContent = user.email;
  loadProducts();
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#loginBtn");
  const err = $("#loginError");
  err.textContent = "";
  btn.disabled = true;
  btn.textContent = "Ingresando...";

  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  btn.disabled = false;
  btn.textContent = "Ingresar";

  if (error) {
    err.textContent = "Correo o contraseña incorrectos.";
    return;
  }
  showDashboard(data.user);
});

$("#logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});

/* =========================================================
   LISTAR PRODUCTOS
   ========================================================= */
async function loadProducts() {
  $("#adminLoading").style.display = "block";
  const { data, error } = await supabaseClient
    .from("productos")
    .select("*")
    .order("id", { ascending: false });

  $("#adminLoading").style.display = "none";

  if (error) {
    toast("Error al cargar productos");
    console.error(error);
    return;
  }
  productsCache = data || [];
  renderTable();
}

function renderTable() {
  const tbody = $("#productsTbody");
  $("#productCount").textContent = productsCache.length;

  if (!productsCache.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#9aa1b0;padding:30px">
      Aún no hay productos. Haz clic en "＋ Nuevo producto" para agregar el primero.</td></tr>`;
    return;
  }

  tbody.innerHTML = productsCache
    .map((p) => {
      const img = p.image_url
        ? `<img class="cell-img" src="${p.image_url}" alt="">`
        : `<div class="cell-img">📦</div>`;
      const stockPill =
        p.stock > 0
          ? `<span class="pill ok">${p.stock} disp.</span>`
          : `<span class="pill out">Agotado</span>`;
      return `
      <tr>
        <td>${img}</td>
        <td class="cell-name">${p.name}</td>
        <td>${p.category || "-"}</td>
        <td>${money(p.price)}</td>
        <td>${stockPill}</td>
        <td>
          <div class="row-actions">
            <button class="btn-edit" data-edit="${p.id}">Editar</button>
            <button class="btn-del" data-del="${p.id}">Borrar</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => openForm(+b.dataset.edit))
  );
  tbody.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteProduct(+b.dataset.del))
  );
}

/* =========================================================
   FORMULARIO (crear / editar)
   ========================================================= */
function fillCategories() {
  const sel = $("#pCategory");
  sel.innerHTML = CATEGORIES.map(
    (c) => `<option value="${c.name}">${c.name}</option>`
  ).join("");
}

function openForm(id) {
  $("#productForm").reset();
  $("#imgPreview").innerHTML = "";
  $("#formError").textContent = "";
  fillCategories();

  if (id) {
    const p = productsCache.find((x) => x.id === id);
    if (!p) return;
    $("#formTitle").textContent = "Editar producto";
    $("#pId").value = p.id;
    $("#pName").value = p.name || "";
    $("#pCategory").value = p.category || CATEGORIES[0].name;
    $("#pBrand").value = p.brand || "";
    $("#pTag").value = p.tag || "";
    $("#pPrice").value = p.price || 0;
    $("#pOldPrice").value = p.old_price || 0;
    $("#pStock").value = p.stock || 0;
    $("#pSold").value = p.sold || 0;
    $("#pRating").value = p.rating || 5;
    $("#pSizes").value = (p.sizes || []).join(", ");
    $("#pColors").value = (p.colors || [])
      .map((c) => `${c.name}:${c.hex}`)
      .join(", ");
    $("#pDesc").value = p.description || "";
    if (p.image_url)
      $("#imgPreview").innerHTML = `<img src="${p.image_url}" alt="">`;
  } else {
    $("#formTitle").textContent = "Nuevo producto";
    $("#pId").value = "";
  }

  $("#formModal").classList.add("open");
}

function closeForm() {
  $("#formModal").classList.remove("open");
}

$("#newProductBtn").addEventListener("click", () => openForm(null));
$("#formClose").addEventListener("click", closeForm);
$("#formCancel").addEventListener("click", closeForm);

// Vista previa de la imagen seleccionada
$("#pImage").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  $("#imgPreview").innerHTML = `<img src="${url}" alt="">`;
});

// Convierte los textos de tallas y colores a los formatos correctos
function parseSizes(str) {
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
function parseColors(str) {
  return str
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [name, hex] = c.split(":").map((x) => (x || "").trim());
      return { name: name || "Color", hex: hex || "#cccccc" };
    });
}

// Sube la foto al bucket y devuelve la URL pública
async function uploadImage(file) {
  const ext = file.name.split(".").pop();
  const fileName = `producto_${Date.now()}.${ext}`;
  const { error } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;

  const { data } = supabaseClient.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(fileName);
  return data.publicUrl;
}

$("#productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#saveBtn");
  const err = $("#formError");
  err.textContent = "";
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const id = $("#pId").value;
    const file = $("#pImage").files[0];

    // datos base del producto
    const payload = {
      name: $("#pName").value.trim(),
      category: $("#pCategory").value,
      brand: $("#pBrand").value.trim(),
      tag: $("#pTag").value.trim(),
      price: Number($("#pPrice").value) || 0,
      old_price: Number($("#pOldPrice").value) || 0,
      stock: Number($("#pStock").value) || 0,
      sold: Number($("#pSold").value) || 0,
      rating: Number($("#pRating").value) || 5,
      sizes: parseSizes($("#pSizes").value),
      colors: parseColors($("#pColors").value),
      description: $("#pDesc").value.trim(),
    };

    // si hay foto nueva, la subimos
    if (file) {
      payload.image_url = await uploadImage(file);
    }

    let res;
    if (id) {
      res = await supabaseClient.from("productos").update(payload).eq("id", id);
    } else {
      res = await supabaseClient.from("productos").insert(payload);
    }
    if (res.error) throw res.error;

    toast(id ? "✅ Producto actualizado" : "✅ Producto creado");
    closeForm();
    loadProducts();
  } catch (e2) {
    console.error(e2);
    err.textContent = "Error al guardar: " + (e2.message || "intenta de nuevo");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar producto";
  }
});

/* =========================================================
   BORRAR PRODUCTO
   ========================================================= */
async function deleteProduct(id) {
  const p = productsCache.find((x) => x.id === id);
  if (!confirm(`¿Seguro que quieres borrar "${p ? p.name : "este producto"}"?`))
    return;

  const { error } = await supabaseClient.from("productos").delete().eq("id", id);
  if (error) {
    toast("Error al borrar");
    return;
  }
  toast("🗑 Producto borrado");
  loadProducts();
}

// Cerrar modal al hacer clic afuera
$("#formModal").addEventListener("click", (e) => {
  if (e.target.id === "formModal") closeForm();
});

/* =========================================================
   INICIO
   ========================================================= */
checkSession();
