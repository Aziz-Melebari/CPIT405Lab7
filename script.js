// ---------------------------------------------------------------
// Settings
// ---------------------------------------------------------------
const API_URL = "https://api.unsplash.com/search/photos";
const PER_PAGE = 12;
const UTM = "utm_source=cpit405_lab&utm_medium=referral"; // Unsplash asks apps to credit photographers

// ---------------------------------------------------------------
// Element references
// ---------------------------------------------------------------
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const methodSelect = document.getElementById("method-select");
const requestInfo = document.getElementById("request-info");
const messageBox = document.getElementById("message");
const resultsGrid = document.getElementById("results");
const loadMoreBtn = document.getElementById("load-more");

const lightbox = document.getElementById("lightbox");
const lbImg = document.getElementById("lb-img");
const lbCaption = document.getElementById("lb-caption");

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
let currentQuery = "";
let currentPage = 1;
let totalPages = 0;
let photos = [];          // every photo currently shown (used by the lightbox)
let lightboxIndex = -1;

// ---------------------------------------------------------------
// Building the request
// ---------------------------------------------------------------
function buildUrl(query, page) {
    const params = new URLSearchParams({ query, page, per_page: PER_PAGE });
    return `${API_URL}?${params}`;
}

// Same header you would set in Postman: Authorization: Client-ID <key>
const AUTH_HEADER = `Client-ID ${UNSPLASH_ACCESS_KEY}`;

// Turns an HTTP error status into a readable message
function describeError(status) {
    if (status === 401) return "401 Unauthorized: check your Access Key in config.js.";
    if (status === 403) return "403 Forbidden: rate limit reached (demo apps get 50 requests/hour). Try again later.";
    if (status === 404) return "404 Not found.";
    return `Request failed with status ${status}.`;
}

// ---------------------------------------------------------------
// METHOD 1: XMLHttpRequest (callbacks)
// ---------------------------------------------------------------
function fetchWithXHR(url, onSuccess, onError) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.setRequestHeader("Authorization", AUTH_HEADER);

    xhr.onload = () => {
        const info = { status: xhr.status, remaining: xhr.getResponseHeader("X-Ratelimit-Remaining") };
        if (xhr.status >= 200 && xhr.status < 300) {
            onSuccess(JSON.parse(xhr.responseText), info);
        } else {
            onError(new Error(describeError(xhr.status)), info);
        }
    };
    xhr.onerror = () => onError(new Error("Network error: could not reach the Unsplash API."), {});
    xhr.send();
}

// ---------------------------------------------------------------
// METHOD 2: fetch with promises (.then / .catch)
// ---------------------------------------------------------------
function fetchWithPromise(url) {
    let info = {};
    return fetch(url, { headers: { Authorization: AUTH_HEADER } })
        .then(response => {
            info = { status: response.status, remaining: response.headers.get("X-Ratelimit-Remaining") };
            if (!response.ok) throw new Error(describeError(response.status));
            return response.json();
        })
        .then(data => ({ data, info }))
        .catch(error => {
            error.info = info;
            throw error;
        });
}

// ---------------------------------------------------------------
// METHOD 3: fetch with async / await
// ---------------------------------------------------------------
async function fetchWithAsync(url) {
    let info = {};
    try {
        const response = await fetch(url, { headers: { Authorization: AUTH_HEADER } });
        info = { status: response.status, remaining: response.headers.get("X-Ratelimit-Remaining") };
        if (!response.ok) throw new Error(describeError(response.status));
        const data = await response.json();
        return { data, info };
    } catch (error) {
        error.info = info;
        throw error;
    }
}

// ---------------------------------------------------------------
// Running a search with the selected method
// ---------------------------------------------------------------
const METHOD_NAMES = {
    xhr: "XHR",
    promise: "fetch (promises)",
    async: "fetch (async/await)"
};

function runSearch(query, page) {
    const method = methodSelect.value;
    const url = buildUrl(query, page);
    const startedAt = performance.now();

    setBusy(true);
    showMessage(page === 1 ? "Loading..." : "");

    const done = (data, info) => {
        showRequestInfo(method, url, info, performance.now() - startedAt);
        handleResults(data, page);
        setBusy(false);
    };
    const failed = error => {
        showRequestInfo(method, url, error.info || {}, performance.now() - startedAt, error.message);
        showMessage(error.message, true);
        setBusy(false);
    };

    if (method === "xhr") {
        fetchWithXHR(url, done, (error, info) => { error.info = info; failed(error); });
    } else if (method === "promise") {
        fetchWithPromise(url).then(({ data, info }) => done(data, info)).catch(failed);
    } else {
        (async () => {
            try {
                const { data, info } = await fetchWithAsync(url);
                done(data, info);
            } catch (error) {
                failed(error);
            }
        })();
    }
}

function startNewSearch() {
    const query = searchInput.value.trim();
    if (!query) {
        showMessage("Please type something to search for.", true);
        return;
    }
    if (UNSPLASH_ACCESS_KEY === "YOUR_ACCESS_KEY") {
        showMessage("Add your Unsplash Access Key to config.js first.", true);
        return;
    }
    currentQuery = query;
    currentPage = 1;
    photos = [];
    resultsGrid.replaceChildren();
    loadMoreBtn.hidden = true;
    runSearch(currentQuery, currentPage);
}

// ---------------------------------------------------------------
// Showing results (DOM API only, no innerHTML)
// ---------------------------------------------------------------
function handleResults(data, page) {
    totalPages = data.total_pages;

    if (page === 1 && data.results.length === 0) {
        showMessage(`No photos found for "${currentQuery}".`);
        return;
    }

    showMessage(`${data.total.toLocaleString()} photos found for "${currentQuery}"`);

    data.results.forEach(photo => {
        photos.push(photo);
        resultsGrid.appendChild(createCard(photo, photos.length - 1));
    });

    loadMoreBtn.hidden = currentPage >= totalPages;
}

function createCard(photo, index) {
    const card = document.createElement("figure");
    card.className = "card";
    card.tabIndex = 0;                       // lets keyboard users reach the photo
    card.dataset.index = index;
    card.style.backgroundColor = photo.color || "#ddd";

    const img = document.createElement("img");
    img.src = photo.urls.small;
    img.alt = photo.alt_description || `Photo by ${photo.user.name}`;
    img.loading = "lazy";

    const overlay = document.createElement("figcaption");
    overlay.className = "overlay";
    overlay.textContent = `Photo by ${photo.user.name}`;

    card.append(img, overlay);
    return card;
}

function showMessage(text, isError = false) {
    messageBox.textContent = text;
    messageBox.classList.toggle("error", isError);
}

function setBusy(isBusy) {
    searchBtn.disabled = isBusy;
    loadMoreBtn.disabled = isBusy;
}

// Request inspector (what you would look at in Postman)
function showRequestInfo(method, url, info, ms, errorText) {
    requestInfo.replaceChildren();

    const line1 = document.createElement("div");
    line1.textContent = `GET ${url}`;

    const line2 = document.createElement("div");
    const status = document.createElement("span");
    status.className = info.status >= 200 && info.status < 300 ? "ok" : "bad";
    status.textContent = info.status ? `HTTP ${info.status}` : "No response";
    line2.append(`${METHOD_NAMES[method]} \u00B7 `, status, ` \u00B7 ${Math.round(ms)} ms`);
    if (info.remaining != null) line2.append(` \u00B7 rate limit remaining: ${info.remaining}`);

    requestInfo.append(line1, line2);
}

// ---------------------------------------------------------------
// MOUSE events (event delegation on the grid)
// ---------------------------------------------------------------
resultsGrid.addEventListener("mouseover", event => {
    const card = event.target.closest(".card");
    if (card) card.classList.add("active");
});

resultsGrid.addEventListener("mouseout", event => {
    const card = event.target.closest(".card");
    if (card) card.classList.remove("active");
});

resultsGrid.addEventListener("click", event => {
    const card = event.target.closest(".card");
    if (card) openLightbox(Number(card.dataset.index));
});

searchBtn.addEventListener("click", startNewSearch);

loadMoreBtn.addEventListener("click", () => {
    currentPage++;
    runSearch(currentQuery, currentPage);
});

// ---------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------
function openLightbox(index) {
    lightboxIndex = index;
    const photo = photos[index];

    lbImg.src = photo.urls.regular;
    lbImg.alt = photo.alt_description || `Photo by ${photo.user.name}`;

    // Credit the photographer and Unsplash, as the API guidelines ask
    lbCaption.replaceChildren();
    const author = document.createElement("a");
    author.href = `${photo.user.links.html}?${UTM}`;
    author.target = "_blank";
    author.rel = "noopener";
    author.textContent = photo.user.name;
    const site = document.createElement("a");
    site.href = `https://unsplash.com/?${UTM}`;
    site.target = "_blank";
    site.rel = "noopener";
    site.textContent = "Unsplash";
    lbCaption.append("Photo by ", author, " on ", site);

    lightbox.hidden = false;
}

function closeLightbox() {
    lightbox.hidden = true;
    lbImg.removeAttribute("src");
    const card = resultsGrid.querySelector(`.card[data-index="${lightboxIndex}"]`);
    if (card) card.focus();                  // give focus back to the photo
}

function showAdjacent(step) {
    const next = lightboxIndex + step;
    if (next >= 0 && next < photos.length) openLightbox(next);
}

document.getElementById("lb-close").addEventListener("click", closeLightbox);
document.getElementById("lb-prev").addEventListener("click", () => showAdjacent(-1));
document.getElementById("lb-next").addEventListener("click", () => showAdjacent(1));
lightbox.addEventListener("click", event => {
    if (event.target === lightbox) closeLightbox();   // click on the dark backdrop
});

// ---------------------------------------------------------------
// KEYBOARD events
// ---------------------------------------------------------------
searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") startNewSearch();
});

resultsGrid.addEventListener("keydown", event => {
    const card = event.target.closest(".card");
    if (card && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openLightbox(Number(card.dataset.index));
    }
});

document.addEventListener("keydown", event => {
    if (!lightbox.hidden) {
        if (event.key === "Escape") closeLightbox();
        else if (event.key === "ArrowLeft") showAdjacent(-1);
        else if (event.key === "ArrowRight") showAdjacent(1);
        return;
    }
    // "/" jumps to the search box (unless you are already typing somewhere)
    if (event.key === "/" && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        event.preventDefault();
        searchInput.focus();
    }
});
