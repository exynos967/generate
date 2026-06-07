(() => {
  "use strict";

  const DEFAULT_BASE_URL = "https://sinytra.com";
  const MAX_HISTORY = 30;
  const STORAGE = {
    session: "llm-video-studio-session",
    tasks: "llm-video-studio-tasks",
  };

  const VIDEO_MODELS = [
    { value: "sora-2", label: "sora-2 · OpenAI / Sora" },
    { value: "veo3.1", label: "veo3.1 · Google / Veo 1080p" },
    { value: "veo3.1-720p", label: "veo3.1-720p · Google / Veo 720p" },
    { value: "veo3.1-fast", label: "veo3.1-fast · Veo Fast 1080p" },
    { value: "veo3.1-fast-720p", label: "veo3.1-fast-720p · Veo Fast 720p" },
    { value: "veo3.1-pro", label: "veo3.1-pro · Veo Pro 1080p" },
    { value: "veo3.1-pro-720p", label: "veo3.1-pro-720p · Veo Pro 720p" },
    { value: "veo3.1-components", label: "veo3.1-components · 参考图 / 组件 1080p" },
    { value: "veo3.1-components-720p", label: "veo3.1-components-720p · 参考图 / 组件 720p" },
    { value: "veo3.1-fast-components", label: "veo3.1-fast-components · 快速参考图 1080p" },
    { value: "veo3.1-fast-components-720p", label: "veo3.1-fast-components-720p · 快速参考图 720p" },
  ];

  const TERMINAL_STATUS = new Set([
    "completed",
    "complete",
    "succeeded",
    "success",
    "failed",
    "error",
    "cancelled",
    "canceled",
  ]);

  const SUCCESS_STATUS = new Set(["completed", "complete", "succeeded", "success"]);

  const els = {};
  const state = {
    apiKey: "",
    baseUrl: DEFAULT_BASE_URL,
    tasks: [],
    selectedUid: "",
    activePolls: new Map(),
    videoObjectUrl: "",
    videoSourceUrl: "",
    uploads: {
      reference: null,
      first: null,
      last: null,
    },
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (document.querySelector("#loginForm")) {
      initLoginPage();
      return;
    }

    initAppPage();
  }

  function initLoginPage() {
    bindLoginElements();
    loadSessionState();

    if (state.apiKey) {
      redirectToApp();
      return;
    }

    els.baseUrlInput.value = state.baseUrl;
    bindLoginEvents();
    queueMicrotask(() => els.apiKeyInput.focus());
  }

  function initAppPage() {
    bindAppElements();
    loadSessionState();
    state.tasks = readJson(localStorage, STORAGE.tasks, []);

    if (!state.apiKey) {
      redirectToLogin();
      return;
    }

    populateModels();
    bindAppEvents();
    syncEndpointBadge();
    updateImageFields();
    renderPayloadPreview();
    renderHistory();
    els.maskedKey.textContent = maskKey(state.apiKey);
    els.appBaseUrlInput.value = state.baseUrl;
    els.appView.hidden = false;
  }

  function bindLoginElements() {
    Object.assign(els, {
      loginView: document.querySelector("#loginView"),
      loginForm: document.querySelector("#loginForm"),
      apiKeyInput: document.querySelector("#apiKeyInput"),
      baseUrlInput: document.querySelector("#baseUrlInput"),
      rememberKeyInput: document.querySelector("#rememberKeyInput"),
      toggleKeyButton: document.querySelector("#toggleKeyButton"),
      loginError: document.querySelector("#loginError"),
    });
  }

  function bindAppElements() {
    Object.assign(els, {
      appView: document.querySelector("#appView"),
      maskedKey: document.querySelector("#maskedKey"),
      appBaseUrlInput: document.querySelector("#appBaseUrlInput"),
      saveSettingsButton: document.querySelector("#saveSettingsButton"),
      logoutButton: document.querySelector("#logoutButton"),
      endpointBadge: document.querySelector("#endpointBadge"),
      modelSelect: document.querySelector("#modelSelect"),
      videoForm: document.querySelector("#videoForm"),
      aspectRatioSelect: document.querySelector("#aspectRatioSelect"),
      secondsSelect: document.querySelector("#secondsSelect"),
      sizeInput: document.querySelector("#sizeInput"),
      pollIntervalInput: document.querySelector("#pollIntervalInput"),
      audioToggle: document.querySelector("#audioToggle"),
      imageFields: document.querySelector("#imageFields"),
      imageFieldsTitle: document.querySelector("#imageFieldsTitle"),
      imageUploadGrid: document.querySelector("#imageUploadGrid"),
      negativePromptInput: document.querySelector("#negativePromptInput"),
      promptInput: document.querySelector("#promptInput"),
      generateButton: document.querySelector("#generateButton"),
      copyPayloadButton: document.querySelector("#copyPayloadButton"),
      payloadPreview: document.querySelector("#payloadPreview"),
      payloadMode: document.querySelector("#payloadMode"),
      resultEmpty: document.querySelector("#resultEmpty"),
      resultStage: document.querySelector("#resultStage"),
      resultContent: document.querySelector("#resultContent"),
      taskStatusChip: document.querySelector("#taskStatusChip"),
      taskIdText: document.querySelector("#taskIdText"),
      progressBar: document.querySelector("#progressBar"),
      resultVideo: document.querySelector("#resultVideo"),
      resultWaiting: document.querySelector("#resultWaiting"),
      resultLinks: document.querySelector("#resultLinks"),
      responseJson: document.querySelector("#responseJson"),
      downloadVideoButton: document.querySelector("#downloadVideoButton"),
      pollButton: document.querySelector("#pollButton"),
      copyResponseButton: document.querySelector("#copyResponseButton"),
      clearResultButton: document.querySelector("#clearResultButton"),
      requestError: document.querySelector("#requestError"),
      historyList: document.querySelector("#historyList"),
      refreshAllButton: document.querySelector("#refreshAllButton"),
      clearHistoryButton: document.querySelector("#clearHistoryButton"),
    });
  }

  function populateModels() {
    els.modelSelect.innerHTML = VIDEO_MODELS.map((model) => {
      const selected = model.value === "veo3.1-pro" ? "selected" : "";
      return `<option value="${escapeHtml(model.value)}" ${selected}>${escapeHtml(model.label)}</option>`;
    }).join("");
  }

  function loadSessionState() {
    const localSession = readJson(localStorage, STORAGE.session, null);
    const sessionSession = readJson(sessionStorage, STORAGE.session, null);
    const session = sessionSession || localSession || {};

    state.apiKey = String(session.apiKey || "");
    state.baseUrl = normalizeBaseUrl(session.baseUrl || DEFAULT_BASE_URL);
  }

  function bindLoginEvents() {
    els.loginForm.addEventListener("submit", handleLogin);
    els.toggleKeyButton.addEventListener("click", toggleKeyVisibility);
  }

  function bindAppEvents() {
    els.saveSettingsButton.addEventListener("click", saveSettings);
    els.logoutButton.addEventListener("click", logout);
    els.videoForm.addEventListener("input", handleFormChange);
    els.videoForm.addEventListener("change", handleFormChange);
    els.promptInput.addEventListener("input", renderPayloadPreview);
    els.appBaseUrlInput.addEventListener("input", syncEndpointBadge);
    els.generateButton.addEventListener("click", createVideoTask);
    els.copyPayloadButton.addEventListener("click", () => copyText(els.payloadPreview.textContent, "已复制请求 JSON"));
    els.downloadVideoButton.addEventListener("click", handleDownloadVideo);
    els.pollButton.addEventListener("click", () => {
      const task = getSelectedTask();
      if (task?.taskId) {
        pollTask(task.taskId, { surfaceError: true });
      }
    });
    els.copyResponseButton.addEventListener("click", () => copyText(els.responseJson.textContent, "已复制响应 JSON"));
    els.clearResultButton.addEventListener("click", clearResult);
    els.refreshAllButton.addEventListener("click", refreshPendingTasks);
    els.clearHistoryButton.addEventListener("click", clearHistory);
    els.resultLinks.addEventListener("click", handleResultLinkClick);
    els.historyList.addEventListener("click", handleHistoryClick);

    document.querySelectorAll("[data-upload-input]").forEach((input) => {
      input.addEventListener("change", handleUploadInputChange);
    });

    document.querySelectorAll("[data-clear-slot]").forEach((button) => {
      button.addEventListener("click", () => clearUploadSlot(button.dataset.clearSlot));
    });

    document.querySelectorAll("[data-scroll-target]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".tab-button").forEach((tab) => tab.classList.remove("active"));
        button.classList.add("active");
        document.querySelector(`#${button.dataset.scrollTarget}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

  }

  function handleLogin(event) {
    event.preventDefault();
    const apiKey = els.apiKeyInput.value.trim();
    const baseUrl = normalizeBaseUrl(els.baseUrlInput.value || DEFAULT_BASE_URL);

    if (!apiKey) {
      els.loginError.textContent = "请填写 LLMAPI 认证 Key。";
      els.apiKeyInput.focus();
      return;
    }

    state.apiKey = apiKey;
    state.baseUrl = baseUrl;
    persistSession(els.rememberKeyInput.checked ? localStorage : sessionStorage);
    els.loginError.textContent = "";
    redirectToApp();
  }

  function toggleKeyVisibility() {
    els.apiKeyInput.type = els.apiKeyInput.type === "password" ? "text" : "password";
  }

  function saveSettings() {
    state.baseUrl = normalizeBaseUrl(els.appBaseUrlInput.value || DEFAULT_BASE_URL);
    els.appBaseUrlInput.value = state.baseUrl;
    persistSession(localStorage.getItem(STORAGE.session) ? localStorage : sessionStorage);
    syncEndpointBadge();
    flashMessage(els.requestError, "设置已保存。", "ok");
  }

  function logout() {
    stopAllPolling();
    state.apiKey = "";
    state.selectedUid = "";
    localStorage.removeItem(STORAGE.session);
    sessionStorage.removeItem(STORAGE.session);
    clearResult();
    redirectToLogin();
  }

  function redirectToApp() {
    window.location.assign("./index.html");
  }

  function redirectToLogin() {
    window.location.replace("./login.html");
  }

  function handleFormChange(event) {
    if (event.target?.name === "type") {
      updateImageFields();
    }

    if (event.target === els.modelSelect) {
      syncTypeWithModel();
    }

    renderPayloadPreview();
  }

  function syncTypeWithModel() {
    const model = els.modelSelect.value.toLowerCase();
    if (model.includes("components")) {
      setType("3");
      updateImageFields();
    }
  }

  function updateImageFields() {
    const type = selectedType();
    const activeSlots = getActiveUploadSlots(type);
    els.imageFields.hidden = type === "1";
    els.imageFieldsTitle.textContent = type === "2" ? "首尾帧图片" : "参考图片";
    els.imageUploadGrid.dataset.mode = type === "2" ? "frames" : "reference";

    document.querySelectorAll("[data-upload-slot]").forEach((box) => {
      box.hidden = !activeSlots.includes(box.dataset.uploadSlot);
    });

    renderAllUploadSlots();
    renderPayloadPreview();
  }

  function setType(type) {
    const radio = Array.from(els.videoForm.querySelectorAll('input[name="type"]')).find((input) => input.value === type);
    if (radio) {
      radio.checked = true;
    }
  }

  function selectedType() {
    return els.videoForm.querySelector('input[name="type"]:checked')?.value || "1";
  }

  function getActiveUploadSlots(type = selectedType()) {
    if (type === "2") {
      return ["first", "last"];
    }
    if (type === "3") {
      return ["reference"];
    }
    return [];
  }

  function handleUploadInputChange(event) {
    const slot = event.target.dataset.uploadInput;
    const file = event.target.files?.[0];
    if (!slot || !file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      flashMessage(els.requestError, "只能上传图片文件。");
      event.target.value = "";
      return;
    }

    clearUploadSlot(slot, { silent: true });
    state.uploads[slot] = {
      file,
      fileName: file.name,
      fileSize: file.size,
      previewUrl: URL.createObjectURL(file),
      remoteUrl: "",
    };
    renderUploadSlot(slot);
    renderPayloadPreview();
  }

  function clearUploadSlot(slot, { silent = false } = {}) {
    const current = state.uploads[slot];
    if (current?.previewUrl) {
      URL.revokeObjectURL(current.previewUrl);
    }

    state.uploads[slot] = null;
    const input = document.querySelector(`[data-upload-input="${slot}"]`);
    if (input) {
      input.value = "";
    }

    renderUploadSlot(slot);
    renderPayloadPreview();

    if (!silent) {
      flashMessage(els.requestError, "已删除参考图片。", "ok");
    }
  }

  function renderAllUploadSlots() {
    ["reference", "first", "last"].forEach(renderUploadSlot);
  }

  function renderUploadSlot(slot) {
    const upload = state.uploads[slot];
    const preview = document.querySelector(`[data-upload-preview="${slot}"]`);
    const previewWrap = preview?.closest(".upload-preview");
    const drop = preview?.closest(".upload-drop");
    const box = preview?.closest(".upload-box");
    const meta = document.querySelector(`[data-upload-meta="${slot}"]`);
    const title = document.querySelector(`[data-upload-title="${slot}"]`);
    const clearButton = document.querySelector(`[data-clear-slot="${slot}"]`);

    if (!preview || !meta || !title || !clearButton) {
      return;
    }

    const labels = {
      reference: ["参考图", "点击上传图片"],
      first: ["首帧", "点击上传首帧图片"],
      last: ["尾帧", "点击上传尾帧图片"],
    };

    title.textContent = labels[slot][0];
    clearButton.disabled = !upload;

    if (!upload) {
      preview.hidden = true;
      preview.removeAttribute("src");
      previewWrap?.classList.remove("has-image");
      drop?.classList.remove("has-image");
      box?.classList.remove("has-file");
      meta.textContent = labels[slot][1];
      return;
    }

    preview.src = upload.previewUrl || upload.remoteUrl;
    preview.hidden = false;
    previewWrap?.classList.add("has-image");
    drop?.classList.add("has-image");
    box?.classList.add("has-file");
    meta.textContent = upload.remoteUrl ? "已上传到服务器" : `${upload.fileName} · ${formatFileSize(upload.fileSize)}`;
  }

  function getSelectedUploadValues({ preview = false } = {}) {
    return getActiveUploadSlots().map((slot) => {
      const upload = state.uploads[slot];
      if (!upload) {
        return "";
      }
      if (upload.remoteUrl) {
        return upload.remoteUrl;
      }
      return preview ? `<上传后替换：${upload.fileName}>` : "";
    }).filter(Boolean);
  }

  function validateUploadSelection() {
    const type = selectedType();
    const activeSlots = getActiveUploadSlots(type);
    const missing = activeSlots.filter((slot) => !state.uploads[slot]?.file && !state.uploads[slot]?.remoteUrl);

    if (!missing.length) {
      return;
    }

    if (type === "2") {
      throw new Error("首尾帧模式需要上传首帧和尾帧图片。");
    }

    if (type === "3") {
      throw new Error("参考图模式需要上传 1 张参考图片。");
    }
  }

  async function ensureUploadedImages() {
    const slots = getActiveUploadSlots();
    const urls = [];

    for (const slot of slots) {
      const upload = state.uploads[slot];
      if (!upload) {
        continue;
      }
      if (upload.remoteUrl) {
        urls.push(upload.remoteUrl);
        continue;
      }
      urls.push(await uploadReferenceImage(slot));
    }

    renderPayloadPreview();
    return urls;
  }

  async function uploadReferenceImage(slot) {
    const upload = state.uploads[slot];
    if (!upload?.file) {
      throw new Error("请选择要上传的图片。");
    }

    const formData = new FormData();
    formData.append("file", upload.file, upload.file.name);

    const response = await fetch(getUploadUrl(), {
      method: "POST",
      headers: buildHeaders(),
      body: formData,
    });
    const data = await parseResponse(response);

    if (!response.ok) {
      throw new Error(formatHttpError(response, data));
    }

    const [url] = extractUrls(data);
    if (!url) {
      throw new Error("上传接口没有返回可用的图片 URL。");
    }

    upload.remoteUrl = url;
    renderUploadSlot(slot);
    return url;
  }

  function buildPayload({ validate = false, imageUrls = null } = {}) {
    const model = els.modelSelect.value.trim();
    const prompt = els.promptInput.value.trim();
    const type = Number(selectedType());
    const images = imageUrls || getSelectedUploadValues({ preview: !validate });

    if (validate) {
      if (!prompt) {
        throw new Error("请填写视频描述 prompt。");
      }

      if (type !== 1) {
        validateUploadSelection();
      }
    }

    const payload = {
      model,
      prompt,
      type,
      aspect_ratio: els.aspectRatioSelect.value,
      seconds: els.secondsSelect.value,
    };

    const size = els.sizeInput.value.trim();
    if (size) {
      payload.size = size;
    }

    if (type !== 1 && images.length) {
      payload.images = images;
    }

    const negativePrompt = els.negativePromptInput.value.trim();
    if (negativePrompt) {
      payload.negative_prompt = negativePrompt;
    }

    if (isSoraModel(model)) {
      payload.generateAudio = els.audioToggle.checked;
    } else {
      payload.generate_audio = els.audioToggle.checked;
    }

    return payload;
  }

  function renderPayloadPreview() {
    try {
      const payload = buildPayload();
      els.payloadPreview.textContent = JSON.stringify(payload, null, 2);
      els.payloadMode.textContent = isSoraModel(payload.model) ? "Sora 字段" : "Veo 字段";
    } catch (error) {
      els.payloadPreview.textContent = `// ${error.message}`;
    }
  }

  async function createVideoTask() {
    clearRequestError();

    let payload;
    try {
      if (!state.apiKey) {
        throw new Error("请先登录并填写认证 Key。");
      }
      payload = buildPayload({ validate: true });
    } catch (error) {
      flashMessage(els.requestError, error.message);
      return;
    }

    setGenerating(true);
    try {
      if (selectedType() !== "1") {
        setGenerating(true, "上传图片...");
        const imageUrls = await ensureUploadedImages();
        payload = buildPayload({ validate: true, imageUrls });
      }

      setGenerating(true, "提交中...");
      const response = await fetch(getVideosUrl(), {
        method: "POST",
        headers: buildHeaders({ json: true }),
        body: JSON.stringify(payload),
      });
      const data = await parseResponse(response);

      if (!response.ok) {
        throw new Error(formatHttpError(response, data));
      }

      const task = taskFromResponse(data, payload);
      upsertTask(task);
      selectTask(task.uid);

      if (task.taskId && !isTerminal(task.status)) {
        startPolling(task.taskId);
      }
    } catch (error) {
      flashMessage(els.requestError, withCorsHint(error.message));
    } finally {
      setGenerating(false);
    }
  }

  async function pollTask(taskId, { surfaceError = false } = {}) {
    if (!taskId) {
      return null;
    }

    try {
      const response = await fetch(getTaskUrl(taskId), {
        method: "GET",
        headers: buildHeaders(),
      });
      const data = await parseResponse(response);

      if (!response.ok) {
        throw new Error(formatHttpError(response, data));
      }

      const existing = findTaskByTaskId(taskId);
      const merged = mergeTaskResponse(existing, data);
      upsertTask(merged);

      if (state.selectedUid === merged.uid) {
        renderResult(merged);
      }

      if (isTerminal(merged.status)) {
        stopPolling(taskId);
      }

      return merged;
    } catch (error) {
      if (surfaceError) {
        flashMessage(els.requestError, withCorsHint(error.message));
      }
      return null;
    }
  }

  function startPolling(taskId) {
    if (!taskId || state.activePolls.has(taskId)) {
      return;
    }

    const intervalMs = Number(els.pollIntervalInput.value) || 5000;
    const timer = window.setInterval(async () => {
      const task = findTaskByTaskId(taskId);
      if (!task || isTerminal(task.status)) {
        stopPolling(taskId);
        return;
      }
      await pollTask(taskId);
    }, intervalMs);

    state.activePolls.set(taskId, timer);
    window.setTimeout(() => pollTask(taskId), 900);
  }

  function stopPolling(taskId) {
    const timer = state.activePolls.get(taskId);
    if (timer) {
      window.clearInterval(timer);
      state.activePolls.delete(taskId);
    }
  }

  function stopAllPolling() {
    state.activePolls.forEach((timer) => window.clearInterval(timer));
    state.activePolls.clear();
  }

  async function refreshPendingTasks() {
    clearRequestError();
    const pending = state.tasks.filter((task) => task.taskId && !isTerminal(task.status));
    if (!pending.length) {
      flashMessage(els.requestError, "没有进行中的任务。", "ok");
      return;
    }

    await Promise.all(pending.map((task) => pollTask(task.taskId, { surfaceError: false })));
    renderHistory();
    flashMessage(els.requestError, "已刷新进行中的任务。", "ok");
  }

  function buildHeaders({ json = false } = {}) {
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${state.apiKey}`,
    };

    if (json) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }

  function taskFromResponse(response, payload) {
    const taskId = extractTaskId(response);
    const status = normalizeStatus(extractByKeys(response, ["status", "state", "task_status"]) || "queued");
    const progress = extractProgress(response, status);
    const videoUrls = extractVideoUrls(response);
    const urls = unique([...videoUrls, ...extractUrls(response)]);

    return {
      uid: createUid(),
      taskId,
      model: payload.model,
      prompt: payload.prompt,
      status,
      progress,
      videoUrl: videoUrls[0] || "",
      urls,
      payload,
      response,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function mergeTaskResponse(existing, response) {
    const taskId = extractTaskId(response) || existing?.taskId || "";
    const status = normalizeStatus(extractByKeys(response, ["status", "state", "task_status"]) || existing?.status || "processing");
    const progress = extractProgress(response, status, existing?.progress || 0);
    const videoUrls = extractVideoUrls(response);
    const urls = unique([...(existing?.urls || []), ...videoUrls, ...extractUrls(response)]);

    return {
      uid: existing?.uid || createUid(),
      taskId,
      model: existing?.model || extractByKeys(response, ["model"]) || "",
      prompt: existing?.prompt || "",
      status,
      progress,
      videoUrl: videoUrls[0] || existing?.videoUrl || "",
      urls,
      payload: existing?.payload || null,
      response,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function upsertTask(task) {
    const byUid = state.tasks.findIndex((item) => item.uid === task.uid);
    const byTaskId = task.taskId ? state.tasks.findIndex((item) => item.taskId === task.taskId) : -1;
    const index = byUid >= 0 ? byUid : byTaskId;

    if (index >= 0) {
      state.tasks[index] = { ...state.tasks[index], ...task };
    } else {
      state.tasks.unshift(task);
    }

    state.tasks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    state.tasks = state.tasks.slice(0, MAX_HISTORY);
    persistTasks();
    renderHistory();
  }

  function selectTask(uid) {
    const task = state.tasks.find((item) => item.uid === uid);
    if (!task) {
      return;
    }
    state.selectedUid = uid;
    renderResult(task);
  }

  function getSelectedTask() {
    return state.tasks.find((task) => task.uid === state.selectedUid) || null;
  }

  function findTaskByTaskId(taskId) {
    return state.tasks.find((task) => task.taskId === taskId) || null;
  }

  function renderResult(task) {
    els.resultEmpty.hidden = true;
    els.resultContent.hidden = false;
    clearRequestError();

    const status = normalizeStatus(task.status || "queued");
    els.taskStatusChip.textContent = status;
    els.taskStatusChip.className = `status-chip ${status}`;
    els.taskIdText.textContent = task.taskId ? `task_id: ${task.taskId}` : "未返回 task_id";
    els.progressBar.style.width = `${task.progress || 0}%`;
    els.responseJson.textContent = JSON.stringify(task.response || {}, null, 2);
    els.pollButton.disabled = !task.taskId || isTerminal(status);
    els.downloadVideoButton.disabled = !task.videoUrl;

    if (task.videoUrl) {
      if (state.videoSourceUrl === task.videoUrl && state.videoObjectUrl) {
        els.resultVideo.hidden = false;
        els.resultWaiting.hidden = true;
        if (els.resultVideo.src !== state.videoObjectUrl) {
          els.resultVideo.src = state.videoObjectUrl;
        }
      } else {
        els.resultVideo.hidden = true;
        setResultWaiting("视频已生成，正在加载播放器...");
        void ensurePlayableVideo(task);
      }
    } else {
      revokeVideoObjectUrl();
      els.resultVideo.hidden = true;
      setResultWaiting("任务已创建，正在等待视频 URL。");
      els.resultVideo.removeAttribute("src");
    }

    renderResultLinks(task.urls || []);
  }

  function renderResultLinks(urls) {
    els.resultLinks.innerHTML = "";

    urls.forEach((url, index) => {
      const row = document.createElement("div");
      const link = document.createElement("a");
      const copyButton = document.createElement("button");
      const proxyUrl = getVideoProxyUrl(url);

      row.className = "result-link";
      link.href = proxyUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `${index === 0 ? "视频地址" : `备用地址 ${index + 1}`} · ${url}`;
      copyButton.className = "link-button";
      copyButton.type = "button";
      copyButton.dataset.copyUrl = url;
      copyButton.textContent = "复制";
      row.append(link, copyButton);
      els.resultLinks.append(row);
    });
  }

  function renderHistory() {
    if (!state.tasks.length) {
      els.historyList.innerHTML = '<div class="history-empty">暂无任务。创建视频后会在这里保留最近记录。</div>';
      return;
    }

    els.historyList.innerHTML = state.tasks.map((task) => {
      const status = normalizeStatus(task.status || "queued");
      const title = task.prompt || "未命名任务";
      const taskId = task.taskId || "local";
      const time = formatTime(task.updatedAt || task.createdAt);
      return `
        <button class="history-item" type="button" data-uid="${escapeHtml(task.uid)}">
          <span class="history-title">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(task.model || "")} · ${escapeHtml(taskId)}</span>
          </span>
          <span class="status-chip ${escapeHtml(status)}">${escapeHtml(status)}</span>
          <span class="history-meta">${escapeHtml(time)} · ${Number(task.progress || 0)}%</span>
        </button>
      `;
    }).join("");
  }

  function clearResult() {
    state.selectedUid = "";
    revokeVideoObjectUrl();
    els.resultEmpty.hidden = false;
    els.resultContent.hidden = true;
    els.resultVideo.pause();
    els.resultVideo.hidden = true;
    els.resultVideo.removeAttribute("src");
    els.resultWaiting.hidden = true;
    els.resultLinks.innerHTML = "";
    els.responseJson.textContent = "{}";
    els.progressBar.style.width = "0%";
    els.downloadVideoButton.disabled = true;
    clearRequestError();
  }

  function clearHistory() {
    if (!state.tasks.length || !window.confirm("确定清空最近任务记录吗？不会删除 API 侧的任务。")) {
      return;
    }
    stopAllPolling();
    state.tasks = [];
    state.selectedUid = "";
    persistTasks();
    renderHistory();
    clearResult();
  }

  function handleHistoryClick(event) {
    const item = event.target.closest(".history-item");
    if (!item) {
      return;
    }
    selectTask(item.dataset.uid);
    document.querySelector("#workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleResultLinkClick(event) {
    const copyButton = event.target.closest("[data-copy-url]");
    if (!copyButton) {
      return;
    }
    event.preventDefault();
    copyText(copyButton.dataset.copyUrl, "已复制视频 URL");
  }

  async function handleDownloadVideo() {
    const task = getSelectedTask();
    if (!task?.videoUrl) {
      flashMessage(els.requestError, "当前任务还没有可下载的视频 URL。");
      return;
    }

    const objectUrl = await ensurePlayableVideo(task, { surfaceError: true });
    if (!objectUrl) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = buildDownloadFilename(task);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  function setGenerating(isGenerating, label = "提交中...") {
    els.generateButton.disabled = isGenerating;
    els.generateButton.querySelector("span").textContent = isGenerating ? label : "开始生成";
  }

  function syncEndpointBadge() {
    const baseUrl = normalizeBaseUrl(els.appBaseUrlInput?.value || els.baseUrlInput?.value || state.baseUrl);
    if (els.endpointBadge) {
      els.endpointBadge.textContent = getVideosUrl(baseUrl);
      els.endpointBadge.title = getVideosUrl(baseUrl);
    }
  }

  function getVideosUrl(baseUrl = currentBaseUrl()) {
    const normalized = normalizeBaseUrl(baseUrl);

    if (/\/v1\/videos\/?$/i.test(normalized)) {
      return normalized.replace(/\/$/, "");
    }

    if (/\/v1\/?$/i.test(normalized)) {
      return `${normalized.replace(/\/$/, "")}/videos`;
    }

    return `${normalized.replace(/\/$/, "")}/v1/videos`;
  }

  function getTaskUrl(taskId) {
    return `${getVideosUrl()}/${encodeURIComponent(taskId)}`;
  }

  function getUploadUrl() {
    const currentOrigin = window.location.origin;
    if (currentOrigin && currentOrigin !== "null") {
      return `${currentOrigin}/api/upload/file`;
    }

    try {
      const url = new URL(normalizeBaseUrl(currentBaseUrl()), window.location.href);
      return `${url.origin}/api/upload/file`;
    } catch {
      return "/api/upload/file";
    }
  }

  function getVideoProxyUrl(rawUrl) {
    const currentOrigin = window.location.origin;
    const base = currentOrigin && currentOrigin !== "null" ? currentOrigin : "";
    return `${base}/api/proxy/video?url=${encodeURIComponent(rawUrl)}`;
  }

  function currentBaseUrl() {
    return normalizeBaseUrl(els.appBaseUrlInput?.value || state.baseUrl);
  }

  function normalizeBaseUrl(raw) {
    let value = String(raw || "").trim();
    if (!value) {
      return DEFAULT_BASE_URL;
    }

    value = value.replace(/\/+$/, "");
    if (value.startsWith("/") || /^https?:\/\//i.test(value)) {
      return value;
    }

    return `https://${value}`;
  }

  function persistSession(storage) {
    const payload = JSON.stringify({
      apiKey: state.apiKey,
      baseUrl: state.baseUrl,
    });

    localStorage.removeItem(STORAGE.session);
    sessionStorage.removeItem(STORAGE.session);
    storage.setItem(STORAGE.session, payload);
  }

  function persistTasks() {
    localStorage.setItem(STORAGE.tasks, JSON.stringify(state.tasks));
  }

  function readJson(storage, key, fallback) {
    try {
      const value = storage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  function formatHttpError(response, data) {
    const rawMessage = extractByKeys(data, ["message", "error", "detail"]);
    const message = typeof rawMessage === "string" ? rawMessage : JSON.stringify(rawMessage || data);
    return `HTTP ${response.status}: ${message}`;
  }

  function withCorsHint(message) {
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return `${message}。如果直接打开本地 HTML，请确认 API 已允许当前 Origin 的 CORS，或通过同域代理访问。`;
    }
    return message;
  }

  function isSoraModel(model) {
    return String(model).toLowerCase().startsWith("sora");
  }

  function isTerminal(status) {
    return TERMINAL_STATUS.has(normalizeStatus(status));
  }

  function normalizeStatus(status) {
    return String(status || "queued").trim().toLowerCase();
  }

  function extractTaskId(value) {
    return String(
      extractByKeys(value, ["task_id", "taskId", "id"]) ||
        deepFind(value, (key) => ["task_id", "taskid"].includes(key.toLowerCase())) ||
        "",
    );
  }

  function extractProgress(value, status, fallback = 0) {
    const raw = extractByKeys(value, ["progress", "percent", "percentage"]) ?? fallback;
    let progress = Number(raw);

    if (!Number.isFinite(progress)) {
      progress = fallback;
    }

    if (progress > 0 && progress <= 1) {
      progress *= 100;
    }

    if (SUCCESS_STATUS.has(normalizeStatus(status))) {
      progress = 100;
    }

    return Math.max(0, Math.min(100, Math.round(progress)));
  }

  function extractVideoUrls(value) {
    const urls = [];

    pushHttpUrl(urls, value?.video_url);
    pushHttpUrl(urls, value?.url);

    if (value?.data && !Array.isArray(value.data)) {
      pushHttpUrl(urls, value.data.video_url);
      pushHttpUrl(urls, value.data.url);
    }

    if (Array.isArray(value?.data)) {
      value.data.forEach((item) => {
        pushHttpUrl(urls, item?.video_url);
        pushHttpUrl(urls, item?.url);
      });
    }

    if (value?.result && typeof value.result === "object") {
      pushHttpUrl(urls, value.result.video_url);
      pushHttpUrl(urls, value.result.url);
    }

    if (value?.output && typeof value.output === "object") {
      pushHttpUrl(urls, value.output.video_url);
      pushHttpUrl(urls, value.output.url);
    }

    return unique(urls);
  }

  function extractUrls(value) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      return [value];
    }

    const urls = [];
    scan(value, (key, item) => {
      if (typeof item === "string" && /^https?:\/\//i.test(item) && (/url/i.test(key) || key === "raw")) {
        urls.push(item);
      }
    });
    return unique(urls);
  }

  function pushHttpUrl(list, candidate) {
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) {
      list.push(candidate);
    }
  }

  function extractByKeys(value, keys) {
    const wanted = new Set(keys.map((key) => key.toLowerCase()));
    return deepFind(value, (key) => wanted.has(key.toLowerCase()));
  }

  function deepFind(value, predicate) {
    let found;
    scan(value, (key, item) => {
      if (found !== undefined) {
        return;
      }
      if (predicate(key, item) && item !== null && item !== undefined && item !== "") {
        found = item;
      }
    });
    return found;
  }

  function scan(value, visitor, key = "") {
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, visitor, String(index)));
      return;
    }

    if (value && typeof value === "object") {
      Object.entries(value).forEach(([entryKey, entryValue]) => {
        visitor(entryKey, entryValue);
        scan(entryValue, visitor, entryKey);
      });
    } else {
      visitor(key, value);
    }
  }

  function unique(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function setResultWaiting(message) {
    const text = els.resultWaiting.querySelector("p");
    if (text) {
      text.textContent = message;
    }
    els.resultWaiting.hidden = false;
  }

  function revokeVideoObjectUrl() {
    if (state.videoObjectUrl) {
      URL.revokeObjectURL(state.videoObjectUrl);
    }
    state.videoObjectUrl = "";
    state.videoSourceUrl = "";
  }

  async function ensurePlayableVideo(task, { surfaceError = false, force = false } = {}) {
    if (!task?.videoUrl) {
      return "";
    }

    if (!force && state.videoSourceUrl === task.videoUrl && state.videoObjectUrl) {
      return state.videoObjectUrl;
    }

    try {
      const response = await fetch(getVideoProxyUrl(task.videoUrl), {
        method: "GET",
        headers: buildHeaders(),
      });

      if (!response.ok) {
        const data = await parseResponse(response);
        throw new Error(formatHttpError(response, data));
      }

      const blob = await response.blob();
      if (!blob.size) {
        throw new Error("代理返回了空视频数据。");
      }

      revokeVideoObjectUrl();
      state.videoObjectUrl = URL.createObjectURL(blob);
      state.videoSourceUrl = task.videoUrl;

      if (state.selectedUid === task.uid) {
        els.resultVideo.src = state.videoObjectUrl;
        els.resultVideo.hidden = false;
        els.resultWaiting.hidden = true;
        els.downloadVideoButton.disabled = false;
      }

      return state.videoObjectUrl;
    } catch (error) {
      if (state.selectedUid === task.uid) {
        els.resultVideo.hidden = true;
        setResultWaiting("视频地址已返回，但当前浏览器无法直接播放，建议先下载查看。");
        els.downloadVideoButton.disabled = false;
      }
      if (surfaceError) {
        flashMessage(els.requestError, withCorsHint(error.message));
      }
      return "";
    }
  }

  function buildDownloadFilename(task) {
    const base = (task.model || "video").replace(/[^\w.-]+/g, "-");
    const id = (task.taskId || "task").replace(/[^\w.-]+/g, "-");
    return `${base}-${id}.mp4`;
  }

  function createUid() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function maskKey(key) {
    if (!key) {
      return "未登录";
    }

    if (key.length <= 10) {
      return `${key.slice(0, 2)}****${key.slice(-2)}`;
    }

    return `${key.slice(0, 5)}****${key.slice(-4)}`;
  }

  function formatTime(value) {
    if (!value) {
      return "";
    }

    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function formatFileSize(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024 * 1024) {
      return `${Math.max(1, Math.round(size / 1024))} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    flashMessage(els.requestError, successMessage, "ok");
  }

  function flashMessage(target, message, type = "error") {
    target.textContent = message;
    target.style.color = type === "ok" ? "var(--green)" : "var(--red)";
    if (type === "ok") {
      window.setTimeout(() => {
        if (target.textContent === message) {
          target.textContent = "";
          target.style.color = "";
        }
      }, 2200);
    }
  }

  function clearRequestError() {
    els.requestError.textContent = "";
    els.requestError.style.color = "";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
