import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  child,
  get,
  getDatabase,
  ref,
  remove,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBTcH3_tri2L7AHLh1e-YD-0s-QSthuE6Q",
  authDomain: "disk-c98ee.firebaseapp.com",
  databaseURL: "https://disk-c98ee-default-rtdb.firebaseio.com",
  projectId: "disk-c98ee",
  storageBucket: "disk-c98ee.firebasestorage.app",
  messagingSenderId: "59577059636",
  appId: "1:59577059636:web:e98f456d054cc360747d61"
};

const ADMIN_CODE = "771";
const STORAGE_KEY = "disk-search-album";
const IMAGE_PATH = "images";
const MIN_SCALE = 1;
const MAX_SCALE = 6;
const ZOOM_STEP = 0.22;

initializeApp(firebaseConfig);
const database = getDatabase();

const elements = {
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-id"),
  statusBox: document.getElementById("status-box"),
  resultEmpty: document.getElementById("result-empty"),
  resultCard: document.getElementById("result-card"),
  resultImage: document.getElementById("result-image"),
  resultTitle: document.getElementById("result-title"),
  viewerBadge: document.getElementById("viewer-badge"),
  openViewerBtn: document.getElementById("open-viewer-btn"),
  saveAlbumBtn: document.getElementById("save-album-btn"),
  downloadBtn: document.getElementById("download-btn"),
  viewerModal: document.getElementById("viewer-modal"),
  modalViewerBadge: document.getElementById("modal-viewer-badge"),
  viewerHelp: document.getElementById("viewer-help"),
  closeViewerBtn: document.getElementById("close-viewer-btn"),
  zoomInBtn: document.getElementById("zoom-in-btn"),
  zoomOutBtn: document.getElementById("zoom-out-btn"),
  viewerStage: document.getElementById("viewer-stage"),
  viewerCanvas: document.getElementById("viewer-canvas"),
  previewImage: document.getElementById("preview-image"),
  albumOpenBtn: document.getElementById("album-open-btn"),
  albumModal: document.getElementById("album-modal"),
  closeAlbumBtn: document.getElementById("close-album-btn"),
  clearAlbumBtn: document.getElementById("clear-album-btn"),
  albumGrid: document.getElementById("album-grid"),
  albumEmpty: document.getElementById("album-empty"),
  adminEntry: document.getElementById("admin-entry"),
  adminModal: document.getElementById("admin-modal"),
  closeAdminBtn: document.getElementById("close-admin-btn"),
  adminLock: document.getElementById("admin-lock"),
  adminCode: document.getElementById("admin-code"),
  unlockAdminBtn: document.getElementById("unlock-admin-btn"),
  adminPanel: document.getElementById("admin-panel"),
  imageUrl: document.getElementById("image-url"),
  previewLinkBtn: document.getElementById("preview-link-btn"),
  addImageBtn: document.getElementById("add-image-btn"),
  adminPreviewImage: document.getElementById("admin-preview-image"),
  adminPreviewEmpty: document.getElementById("admin-preview-empty"),
  adminStatus: document.getElementById("admin-status"),
  adminList: document.getElementById("admin-list"),
  refreshListBtn: document.getElementById("refresh-list-btn")
};

let currentImage = null;
let adminUnlocked = false;

const viewState = {
  scale: 1,
  x: 0,
  y: 0,
  baseWidth: 0,
  baseHeight: 0,
  pointers: new Map(),
  dragPointerId: null,
  dragStart: null,
  pinchStartDistance: 0,
  pinchStartScale: 1,
  touchMode: false,
  touchCenterStart: null,
  touchStartOffset: null
};

function normalizeId(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 3);
}

function normalizeImageUrl(rawUrl) {
  const input = String(rawUrl || "").trim();

  if (!input) {
    return "";
  }

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "imgur.com") {
      const path = url.pathname.split("/").filter(Boolean);
      if (path.length === 1) {
        return `https://i.imgur.com/${path[0]}.jpg`;
      }
    }

    return url.toString();
  } catch {
    return "";
  }
}

function setStatus(message, target = elements.statusBox) {
  target.textContent = message;
}

function loadAlbum() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAlbum(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function renderAlbum() {
  const items = loadAlbum();
  elements.albumGrid.innerHTML = "";
  elements.albumEmpty.style.display = items.length ? "none" : "block";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "album-card";
    card.innerHTML = `
      <img src="${item.url}" alt="ID ${item.id}">
      <div>
        <h3 class="card-title">ID ${item.id}</h3>
        <div class="mini-actions">
          <button type="button" data-open-album="${item.id}">Открыть</button>
          <button type="button" data-remove-album="${item.id}" class="danger-btn">Убрать</button>
        </div>
      </div>
    `;
    elements.albumGrid.appendChild(card);
  });
}

function updateActionButtons(enabled) {
  elements.openViewerBtn.disabled = !enabled;
  elements.saveAlbumBtn.disabled = !enabled;
  elements.downloadBtn.disabled = !enabled;
  elements.zoomInBtn.disabled = !enabled;
  elements.zoomOutBtn.disabled = !enabled;
}

function openModal(modal) {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function layoutPreviewImage() {
  const stageRect = elements.viewerStage.getBoundingClientRect();
  const naturalWidth = elements.previewImage.naturalWidth || 0;
  const naturalHeight = elements.previewImage.naturalHeight || 0;

  if (!naturalWidth || !naturalHeight || !stageRect.width || !stageRect.height) {
    viewState.baseWidth = 0;
    viewState.baseHeight = 0;
    return;
  }

  const fitRatio = Math.min(stageRect.width / naturalWidth, stageRect.height / naturalHeight);
  viewState.baseWidth = Math.max(1, naturalWidth * fitRatio);
  viewState.baseHeight = Math.max(1, naturalHeight * fitRatio);
  elements.previewImage.style.width = `${viewState.baseWidth}px`;
  elements.previewImage.style.height = `${viewState.baseHeight}px`;
}

function clampScale(scale) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

function clampOffsets() {
  const stageRect = elements.viewerStage.getBoundingClientRect();

  if (!viewState.baseWidth || !viewState.baseHeight || !stageRect.width || !stageRect.height) {
    viewState.x = 0;
    viewState.y = 0;
    return;
  }

  const renderedWidth = viewState.baseWidth * viewState.scale;
  const renderedHeight = viewState.baseHeight * viewState.scale;
  const maxX = Math.max(0, (renderedWidth - stageRect.width) / 2);
  const maxY = Math.max(0, (renderedHeight - stageRect.height) / 2);

  viewState.x = Math.min(maxX, Math.max(-maxX, viewState.x));
  viewState.y = Math.min(maxY, Math.max(-maxY, viewState.y));
}

function applyTransform() {
  layoutPreviewImage();
  clampOffsets();
  elements.previewImage.style.transform = `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`;

  if (currentImage) {
    elements.modalViewerBadge.textContent = `ID ${currentImage.id} · ${Math.round(viewState.scale * 100)}%`;
  }
}

function resetView() {
  viewState.scale = 1;
  viewState.x = 0;
  viewState.y = 0;
  viewState.pointers.clear();
  viewState.dragPointerId = null;
  viewState.dragStart = null;
  viewState.pinchStartDistance = 0;
  viewState.pinchStartScale = 1;
  viewState.touchMode = false;
  viewState.touchCenterStart = null;
  viewState.touchStartOffset = null;
  applyTransform();
}

function setSearchResult(record) {
  currentImage = record;

  if (!record) {
    elements.resultCard.classList.add("hidden");
    elements.resultEmpty.classList.remove("hidden");
    elements.resultImage.removeAttribute("src");
    elements.resultTitle.textContent = "Изображение найдено";
    elements.viewerBadge.textContent = "Ожидание поиска";
    elements.modalViewerBadge.textContent = "Просмотр";
    updateActionButtons(false);
    closeModal(elements.viewerModal);
    resetView();
    return;
  }

  elements.resultEmpty.classList.add("hidden");
  elements.resultCard.classList.remove("hidden");
  elements.resultImage.src = record.url;
  elements.previewImage.src = record.url;
  elements.resultTitle.textContent = "Нажми, чтобы открыть полный просмотр";
  elements.viewerBadge.textContent = `ID ${record.id}`;
  elements.modalViewerBadge.textContent = `ID ${record.id}`;
  updateActionButtons(true);
  resetView();
}

function openViewer() {
  if (!currentImage) {
    return;
  }

  elements.modalViewerBadge.textContent = `ID ${currentImage.id}`;
  elements.previewImage.src = currentImage.url;
  openModal(elements.viewerModal);
  requestAnimationFrame(() => {
    resetView();
  });
}

function closeViewer() {
  closeModal(elements.viewerModal);
  viewState.pointers.clear();
  viewState.dragPointerId = null;
  viewState.dragStart = null;
  viewState.pinchStartDistance = 0;
}

function zoomAtPoint(nextScale, clientX, clientY) {
  if (!currentImage) {
    return;
  }

  const stageRect = elements.viewerStage.getBoundingClientRect();
  const targetScale = clampScale(nextScale);
  const ratio = targetScale / viewState.scale;
  const originX = clientX - stageRect.left - stageRect.width / 2 - viewState.x;
  const originY = clientY - stageRect.top - stageRect.height / 2 - viewState.y;

  viewState.x -= originX * (ratio - 1);
  viewState.y -= originY * (ratio - 1);
  viewState.scale = targetScale;
  applyTransform();
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getPointerCenter(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function handlePointerDown(event) {
  if (!currentImage) {
    return;
  }

  elements.viewerCanvas.setPointerCapture(event.pointerId);
  viewState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (viewState.pointers.size === 1) {
    viewState.dragPointerId = event.pointerId;
    viewState.dragStart = {
      x: event.clientX,
      y: event.clientY,
      imageX: viewState.x,
      imageY: viewState.y
    };
  }

  if (viewState.pointers.size === 2) {
    const [first, second] = [...viewState.pointers.values()];
    viewState.pinchStartDistance = distanceBetween(first, second);
    viewState.pinchStartScale = viewState.scale;
    viewState.dragPointerId = null;
    viewState.dragStart = null;
  }
}

function handlePointerMove(event) {
  if (!currentImage || !viewState.pointers.has(event.pointerId)) {
    return;
  }

  viewState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (viewState.pointers.size === 2) {
    const [first, second] = [...viewState.pointers.values()];
    const center = getPointerCenter(first, second);
    const nextDistance = distanceBetween(first, second);

    if (viewState.pinchStartDistance > 0) {
      zoomAtPoint((nextDistance / viewState.pinchStartDistance) * viewState.pinchStartScale, center.x, center.y);
    }
    return;
  }

  if (viewState.dragPointerId !== event.pointerId || !viewState.dragStart) {
    return;
  }

  viewState.x = viewState.dragStart.imageX + (event.clientX - viewState.dragStart.x);
  viewState.y = viewState.dragStart.imageY + (event.clientY - viewState.dragStart.y);
  applyTransform();
}

function handlePointerEnd(event) {
  if (typeof event.pointerId === "number") {
    viewState.pointers.delete(event.pointerId);
  }

  if (viewState.dragPointerId === event.pointerId) {
    viewState.dragPointerId = null;
    viewState.dragStart = null;
  }

  if (viewState.pointers.size === 1) {
    const [remainingId, remainingPoint] = [...viewState.pointers.entries()][0];
    viewState.dragPointerId = remainingId;
    viewState.dragStart = {
      x: remainingPoint.x,
      y: remainingPoint.y,
      imageX: viewState.x,
      imageY: viewState.y
    };
  }

  if (viewState.pointers.size < 2) {
    viewState.pinchStartDistance = 0;
    viewState.pinchStartScale = viewState.scale;
  }
}

function getTouchesCenter(firstTouch, secondTouch) {
  return {
    x: (firstTouch.clientX + secondTouch.clientX) / 2,
    y: (firstTouch.clientY + secondTouch.clientY) / 2
  };
}

function getTouchesDistance(firstTouch, secondTouch) {
  return Math.hypot(firstTouch.clientX - secondTouch.clientX, firstTouch.clientY - secondTouch.clientY);
}

function handleTouchStart(event) {
  if (!currentImage || event.touches.length === 0) {
    return;
  }

  viewState.touchMode = true;

  if (event.touches.length === 1) {
    const touch = event.touches[0];
    viewState.dragStart = {
      x: touch.clientX,
      y: touch.clientY,
      imageX: viewState.x,
      imageY: viewState.y
    };
  }

  if (event.touches.length === 2) {
    event.preventDefault();
    const [firstTouch, secondTouch] = event.touches;
    viewState.pinchStartDistance = getTouchesDistance(firstTouch, secondTouch);
    viewState.pinchStartScale = viewState.scale;
    viewState.touchCenterStart = getTouchesCenter(firstTouch, secondTouch);
    viewState.touchStartOffset = {
      x: viewState.x,
      y: viewState.y
    };
    viewState.dragStart = null;
  }
}

function handleTouchMove(event) {
  if (!currentImage || event.touches.length === 0 || !viewState.touchMode) {
    return;
  }

  if (event.touches.length === 1 && viewState.dragStart) {
    event.preventDefault();
    const touch = event.touches[0];
    viewState.x = viewState.dragStart.imageX + (touch.clientX - viewState.dragStart.x);
    viewState.y = viewState.dragStart.imageY + (touch.clientY - viewState.dragStart.y);
    applyTransform();
    return;
  }

  if (event.touches.length === 2) {
    event.preventDefault();
    const [firstTouch, secondTouch] = event.touches;
    const center = getTouchesCenter(firstTouch, secondTouch);
    const distance = getTouchesDistance(firstTouch, secondTouch);

    if (viewState.pinchStartDistance > 0) {
      const nextScale = (distance / viewState.pinchStartDistance) * viewState.pinchStartScale;
      zoomAtPoint(nextScale, center.x, center.y);
    }

    if (viewState.touchCenterStart && viewState.touchStartOffset) {
      viewState.x += center.x - viewState.touchCenterStart.x;
      viewState.y += center.y - viewState.touchCenterStart.y;
      viewState.touchCenterStart = center;
      applyTransform();
    }
  }
}

function handleTouchEnd(event) {
  if (event.touches.length === 0) {
    viewState.dragStart = null;
    viewState.pinchStartDistance = 0;
    viewState.touchCenterStart = null;
    viewState.touchStartOffset = null;
    viewState.touchMode = false;
    return;
  }

  if (event.touches.length === 1) {
    const touch = event.touches[0];
    viewState.dragStart = {
      x: touch.clientX,
      y: touch.clientY,
      imageX: viewState.x,
      imageY: viewState.y
    };
    viewState.pinchStartDistance = 0;
    viewState.touchCenterStart = null;
    viewState.touchStartOffset = null;
  }
}

function saveCurrentToAlbum() {
  if (!currentImage) {
    return;
  }

  const items = loadAlbum();
  if (items.some((item) => item.id === currentImage.id)) {
    setStatus(`ID ${currentImage.id} уже есть в альбоме.`);
    return;
  }

  items.unshift({ id: currentImage.id, url: currentImage.url });
  saveAlbum(items);
  renderAlbum();
  setStatus(`ID ${currentImage.id} сохранен в альбом.`);
}

function removeFromAlbum(id) {
  saveAlbum(loadAlbum().filter((item) => item.id !== id));
  renderAlbum();
}

function downloadCurrentImage() {
  if (!currentImage) {
    return;
  }

  const link = document.createElement("a");
  link.href = currentImage.url;
  link.download = `image-${currentImage.id}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.click();
}

async function getAllImages() {
  const snapshot = await get(ref(database, IMAGE_PATH));
  return snapshot.exists() ? snapshot.val() : {};
}

async function getImageById(id) {
  const snapshot = await get(child(ref(database), `${IMAGE_PATH}/${id}`));
  return snapshot.exists() ? snapshot.val() : null;
}

async function generateUniqueId() {
  const allImages = await getAllImages();
  const usedIds = new Set(Object.keys(allImages));

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const next = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    if (!usedIds.has(next)) {
      return next;
    }
  }

  throw new Error("Свободные ID закончились.");
}

async function searchImage(event) {
  event.preventDefault();
  const id = normalizeId(elements.searchInput.value);

  if (id.length !== 3) {
    setStatus("Нужны ровно 3 цифры.");
    setSearchResult(null);
    return;
  }

  setStatus(`Ищу ID ${id}...`);

  try {
    const record = await getImageById(id);

    if (!record) {
      setSearchResult(null);
      setStatus(`ID ${id} не найден.`);
      return;
    }

    setSearchResult(record);
    setStatus("Фото найдено. Нажми на карточку или кнопку просмотра.");
  } catch (error) {
    setSearchResult(null);
    setStatus(`Ошибка поиска: ${error.message}`);
  }
}

function unlockAdmin() {
  if (elements.adminCode.value !== ADMIN_CODE) {
    setStatus("Неверный код.", elements.adminStatus);
    return;
  }

  adminUnlocked = true;
  elements.adminLock.classList.add("hidden");
  elements.adminPanel.classList.remove("hidden");
  setStatus("Доступ открыт.", elements.adminStatus);
  renderAdminList();
}

function setAdminPreview(url) {
  if (!url) {
    elements.adminPreviewImage.style.display = "none";
    elements.adminPreviewImage.removeAttribute("src");
    elements.adminPreviewEmpty.style.display = "grid";
    return;
  }

  elements.adminPreviewImage.src = url;
  elements.adminPreviewImage.style.display = "block";
  elements.adminPreviewEmpty.style.display = "none";
}

async function previewAdminUrl() {
  const normalized = normalizeImageUrl(elements.imageUrl.value);

  if (!normalized) {
    setAdminPreview("");
    setStatus("Нужна корректная ссылка.", elements.adminStatus);
    return;
  }

  setAdminPreview(normalized);
  setStatus("Проверяю превью.", elements.adminStatus);
}

async function addImage() {
  const normalized = normalizeImageUrl(elements.imageUrl.value);

  if (!normalized) {
    setStatus("Сначала вставь рабочую ссылку.", elements.adminStatus);
    return;
  }

  setStatus("Добавляю запись...", elements.adminStatus);

  try {
    const id = await generateUniqueId();
    await set(ref(database, `${IMAGE_PATH}/${id}`), {
      id,
      url: normalized,
      createdAt: new Date().toISOString()
    });

    elements.imageUrl.value = "";
    setAdminPreview(normalized);
    setStatus(`Добавлено. ID: ${id}.`, elements.adminStatus);
    await renderAdminList();
  } catch (error) {
    setStatus(`Не удалось добавить: ${error.message}`, elements.adminStatus);
  }
}

async function deleteImage(id) {
  setStatus(`Удаляю ID ${id}...`, elements.adminStatus);

  try {
    await remove(ref(database, `${IMAGE_PATH}/${id}`));
    if (currentImage?.id === id) {
      setSearchResult(null);
      setStatus(`ID ${id} удален из базы.`);
    }
    await renderAdminList();
    setStatus(`ID ${id} удален.`, elements.adminStatus);
  } catch (error) {
    setStatus(`Ошибка удаления: ${error.message}`, elements.adminStatus);
  }
}

async function renderAdminList() {
  if (!adminUnlocked) {
    return;
  }

  elements.adminList.innerHTML = "";
  setStatus("Загружаю базу...", elements.adminStatus);

  try {
    const data = await getAllImages();
    const entries = Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));

    if (!entries.length) {
      elements.adminList.innerHTML = `<div class="admin-status">База пока пустая.</div>`;
      setStatus("База пуста.", elements.adminStatus);
      return;
    }

    entries.forEach(([id, record]) => {
      const card = document.createElement("article");
      card.className = "admin-card";
      card.innerHTML = `
        <img src="${record.url}" alt="ID ${id}">
        <div>
          <h3 class="card-title">ID ${id}</h3>
          <p class="meta">${record.url}</p>
          <p class="meta">${new Date(record.createdAt).toLocaleString("ru-RU")}</p>
          <div class="mini-actions">
            <button type="button" data-open-id="${id}">Открыть</button>
            <button type="button" data-delete-id="${id}" class="danger-btn">Удалить</button>
          </div>
        </div>
      `;
      elements.adminList.appendChild(card);
    });

    setStatus(`Записей: ${entries.length}.`, elements.adminStatus);
  } catch (error) {
    setStatus(`Не удалось загрузить базу: ${error.message}`, elements.adminStatus);
  }
}

elements.searchForm.addEventListener("submit", searchImage);
elements.searchInput.addEventListener("input", (event) => {
  event.target.value = normalizeId(event.target.value);
});
elements.adminCode.addEventListener("input", (event) => {
  event.target.value = normalizeId(event.target.value);
});

elements.openViewerBtn.addEventListener("click", openViewer);
elements.resultImage.addEventListener("click", openViewer);
elements.closeViewerBtn.addEventListener("click", closeViewer);

elements.zoomInBtn.addEventListener("click", () => {
  const rect = elements.viewerStage.getBoundingClientRect();
  zoomAtPoint(viewState.scale + ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
});

elements.zoomOutBtn.addEventListener("click", () => {
  const rect = elements.viewerStage.getBoundingClientRect();
  zoomAtPoint(viewState.scale - ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
});

elements.viewerCanvas.addEventListener("wheel", (event) => {
  if (!currentImage) {
    return;
  }

  event.preventDefault();
  const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  zoomAtPoint(viewState.scale + delta, event.clientX, event.clientY);
}, { passive: false });

elements.viewerCanvas.addEventListener("pointerdown", handlePointerDown);
elements.viewerCanvas.addEventListener("pointermove", handlePointerMove);
elements.viewerCanvas.addEventListener("pointerup", handlePointerEnd);
elements.viewerCanvas.addEventListener("pointercancel", handlePointerEnd);
elements.viewerCanvas.addEventListener("lostpointercapture", handlePointerEnd);
elements.viewerCanvas.addEventListener("touchstart", handleTouchStart, { passive: false });
elements.viewerCanvas.addEventListener("touchmove", handleTouchMove, { passive: false });
elements.viewerCanvas.addEventListener("touchend", handleTouchEnd, { passive: false });
elements.viewerCanvas.addEventListener("touchcancel", handleTouchEnd, { passive: false });

elements.saveAlbumBtn.addEventListener("click", saveCurrentToAlbum);
elements.downloadBtn.addEventListener("click", downloadCurrentImage);

elements.albumOpenBtn.addEventListener("click", () => openModal(elements.albumModal));
elements.closeAlbumBtn.addEventListener("click", () => closeModal(elements.albumModal));
elements.clearAlbumBtn.addEventListener("click", () => {
  saveAlbum([]);
  renderAlbum();
});

elements.albumGrid.addEventListener("click", (event) => {
  const openId = event.target.getAttribute("data-open-album");
  const removeId = event.target.getAttribute("data-remove-album");

  if (openId) {
    const record = loadAlbum().find((item) => item.id === openId);
    if (record) {
      setSearchResult(record);
      setStatus(`Открыто изображение ID ${record.id} из альбома.`);
      closeModal(elements.albumModal);
    }
  }

  if (removeId) {
    removeFromAlbum(removeId);
  }
});

elements.adminEntry.addEventListener("click", () => openModal(elements.adminModal));
elements.closeAdminBtn.addEventListener("click", () => closeModal(elements.adminModal));
elements.unlockAdminBtn.addEventListener("click", unlockAdmin);
elements.previewLinkBtn.addEventListener("click", previewAdminUrl);
elements.addImageBtn.addEventListener("click", addImage);
elements.refreshListBtn.addEventListener("click", renderAdminList);

document.addEventListener("click", async (event) => {
  if (event.target.dataset.closeViewer === "true") {
    closeViewer();
  }
  if (event.target.dataset.closeAlbum === "true") {
    closeModal(elements.albumModal);
  }
  if (event.target.dataset.closeAdmin === "true") {
    closeModal(elements.adminModal);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeViewer();
    closeModal(elements.albumModal);
    closeModal(elements.adminModal);
  }
});

elements.adminList.addEventListener("click", async (event) => {
  const openId = event.target.getAttribute("data-open-id");
  const deleteId = event.target.getAttribute("data-delete-id");

  if (openId) {
    const record = await getImageById(openId);
    if (record) {
      setSearchResult(record);
      setStatus(`Открыто изображение ID ${record.id}.`);
      closeModal(elements.adminModal);
    }
  }

  if (deleteId) {
    await deleteImage(deleteId);
  }
});

elements.previewImage.addEventListener("load", () => {
  resetView();
  elements.viewerHelp.textContent = "На телефоне работает pinch двумя пальцами. Фото сразу вписывается в экран, потом его можно увеличивать и двигать.";
});

elements.previewImage.addEventListener("error", () => {
  closeViewer();
  setStatus("Картинка не загрузилась. Возможно, ссылка в базе больше не работает.");
});

elements.resultImage.addEventListener("error", () => {
  setSearchResult(null);
  setStatus("Превью не загрузилось. Возможно, ссылка в базе сломана.");
});

elements.adminPreviewImage.addEventListener("load", () => {
  setStatus("Превью готово. Можно добавлять.", elements.adminStatus);
});

elements.adminPreviewImage.addEventListener("error", () => {
  setAdminPreview("");
  setStatus("Превью не загрузилось. Нужна прямая ссылка на файл.", elements.adminStatus);
});

window.addEventListener("resize", () => {
  if (!elements.viewerModal.classList.contains("hidden")) {
    applyTransform();
  }
});

renderAlbum();
setSearchResult(null);
setStatus("Введи ID, найди фото и открой его в просмотре.");
