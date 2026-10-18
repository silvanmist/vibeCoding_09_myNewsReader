/**
 * 맞춤형 뉴스 리더 (Custom News Reader)
 * - 순수 HTML / Vanilla CSS / Vanilla JavaScript 구현
 * - 무료 오픈 뉴스 API (ok.surf CORS-enabled feed) 활용
 */

// 카테고리 한국어 매핑 및 색상 정보
const CATEGORY_MAP = {
  Business: { name: '비즈니스', icon: '💼', color: '#0284c7' },
  Sports: { name: '스포츠', icon: '⚽', color: '#16a34a' },
  Entertainment: { name: '문화', icon: '🎭', color: '#9333ea' }
};

// 기본 대체 이미지 (카테고리별 고화질 언스플래시)
const FALLBACK_IMAGES = {
  Business: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
  Sports: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=80',
  Entertainment: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80'
};

// 애플리케이션 상태 (State)
const appState = {
  rawApiData: null,         // API에서 불러온 원본 카테고리별 데이터
  filteredPool: [],         // 선택된 주제들의 전체 기사 풀
  displayedArticles: [],    // 현재 화면에 렌더링된 기사 목록
  currentIndex: 0,          // 현재 로드된 기사 인덱스
  pageSize: 10,             // 한 번에 추가 로드할 기사 개수 (스크롤당 10건)
  initialPerCategory: 10,   // 초기 로드 시 각 주제별 기사 개수
  isLoading: false,
  hasMore: true
};

// DOM 요소 캐싱
const elements = {
  businessCheckbox: document.getElementById('cat-business'),
  sportsCheckbox: document.getElementById('cat-sports'),
  cultureCheckbox: document.getElementById('cat-culture'),
  fetchBtn: document.getElementById('fetch-news-btn'),
  newsGrid: document.getElementById('news-grid'),
  countBadge: document.getElementById('article-count-badge'),
  activeTopicsTags: document.getElementById('active-topics-tags'),
  scrollTrigger: document.getElementById('infinite-scroll-trigger'),
  loadingSpinner: document.getElementById('loading-spinner'),
  endOfFeed: document.getElementById('end-of-feed'),
  modal: document.getElementById('article-modal'),
  modalCloseBtn: document.getElementById('modal-close-btn'),
  modalCategory: document.getElementById('modal-category'),
  modalSourceIcon: document.getElementById('modal-source-icon'),
  modalSourceName: document.getElementById('modal-source-name'),
  modalTitle: document.getElementById('modal-title'),
  modalImage: document.getElementById('modal-image'),
  modalDescription: document.getElementById('modal-description'),
  modalOriginalLink: document.getElementById('modal-original-link')
};

// ==========================================================================
// 1. API 통신 및 데이터 가공
// ==========================================================================

/**
 * 무료 뉴스 피드 API 호출 (ok.surf CORS-enabled public news API)
 */
async function fetchNewsData() {
  const API_URL = 'https://ok.surf/api/v1/cors/news-feed';
  
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`API 응답 오류: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn('외부 API 호출 실패. 내장 백업 뉴스로 전환합니다:', error);
    return getFallbackNewsData();
  }
}

/**
 * 네트워크 오프라인 또는 API 오류 시 사용할 백업 뉴스 데이터
 */
function getFallbackNewsData() {
  const dummyArticles = (category, count) => {
    return Array.from({ length: count }, (_, i) => ({
      title: `[${CATEGORY_MAP[category].name}] 최신 주요 동향 및 헤드라인 뉴스 리포트 #${i + 1}`,
      link: 'https://news.google.com',
      og: FALLBACK_IMAGES[category],
      source: `${CATEGORY_MAP[category].name} 일보`,
      source_icon: 'https://www.google.com/favicon.ico'
    }));
  };

  return {
    Business: dummyArticles('Business', 25),
    Sports: dummyArticles('Sports', 25),
    Entertainment: dummyArticles('Entertainment', 25)
  };
}

/**
 * 현재 체크된 주제 목록 반환
 */
function getSelectedCategories() {
  const categories = [];
  if (elements.businessCheckbox.checked) categories.push('Business');
  if (elements.sportsCheckbox.checked) categories.push('Sports');
  if (elements.cultureCheckbox.checked) categories.push('Entertainment');
  return categories;
}

// ==========================================================================
// 2. 피드 로드 및 무한 스크롤 로직
// ==========================================================================

/**
 * '뉴스 보기' 버튼 클릭 시 초기 로딩 (요구사항 1, 2)
 */
async function handleFetchNews() {
  const selectedCategories = getSelectedCategories();

  if (selectedCategories.length === 0) {
    alert('최소 하나 이상의 주제(비즈니스, 스포츠, 문화)를 선택해 주세요.');
    return;
  }

  // 상태 초기화
  appState.isLoading = true;
  appState.displayedArticles = [];
  appState.currentIndex = 0;
  appState.hasMore = true;
  elements.newsGrid.innerHTML = '';
  elements.endOfFeed.classList.add('hidden');
  elements.loadingSpinner.classList.remove('hidden');
  elements.fetchBtn.disabled = true;

  updateActiveTopicsUI(selectedCategories);

  try {
    // API 데이터가 없으면 최초 1회 요청
    if (!appState.rawApiData) {
      appState.rawApiData = await fetchNewsData();
    }

    // 선택된 각 카테고리별로 상위 10개(initialPerCategory) 기사를 먼저 취합
    const initialBatch = [];
    const remainingPool = [];

    selectedCategories.forEach(cat => {
      const articles = appState.rawApiData[cat] || [];
      // 카테고리 정보 주입
      const formatted = articles.map(item => ({
        ...item,
        category: cat,
        fallbackImage: FALLBACK_IMAGES[cat]
      }));

      // 요구사항 2: 선택한 각 주제에 대한 상위 10개의 헤드라인을 추출
      const top10 = formatted.slice(0, appState.initialPerCategory);
      const rest = formatted.slice(appState.initialPerCategory);

      initialBatch.push(...top10);
      remainingPool.push(...rest);
    });

    // 교차 배치(인터리빙)하여 다양한 주제가 골고루 나오도록 섞음
    const shuffledInitial = interleaveArrays(
      selectedCategories.map(cat => initialBatch.filter(a => a.category === cat))
    );

    // 무한 스크롤을 위한 남은 기사 풀 구성
    const shuffledRemaining = interleaveArrays(
      selectedCategories.map(cat => remainingPool.filter(a => a.category === cat))
    );

    // 전체 기사 풀 설정
    appState.filteredPool = [...shuffledInitial, ...shuffledRemaining];

    // 첫 배치 렌더링 (각 주제별 상위 10건들의 모음)
    const firstRenderCount = shuffledInitial.length;
    renderArticles(appState.filteredPool.slice(0, firstRenderCount));
    appState.currentIndex = firstRenderCount;

    // 더 불러올 기사가 있는지 확인
    appState.hasMore = appState.currentIndex < appState.filteredPool.length;
    if (!appState.hasMore) {
      elements.endOfFeed.classList.remove('hidden');
    }
  } catch (err) {
    console.error('뉴스 처리 중 오류 발생:', err);
    elements.newsGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">뉴스를 불러오지 못했습니다</div>
        <p class="empty-desc">네트워크 상태를 확인하고 잠시 후 다시 시도해 주세요.</p>
      </div>
    `;
  } finally {
    appState.isLoading = false;
    elements.loadingSpinner.classList.add('hidden');
    elements.fetchBtn.disabled = false;
    updateBadge();
  }
}

/**
 * 페이지 아래까지 스크롤 시 기사 10건 추가 로드 (요구사항 4: 무한 스크롤)
 */
function loadMoreArticles() {
  if (appState.isLoading || !appState.hasMore) return;

  appState.isLoading = true;
  elements.loadingSpinner.classList.remove('hidden');

  // 부드러운 로딩 경험을 위해 약간의 딜레이
  setTimeout(() => {
    const nextBatch = appState.filteredPool.slice(
      appState.currentIndex,
      appState.currentIndex + appState.pageSize
    );

    if (nextBatch.length > 0) {
      renderArticles(nextBatch, true);
      appState.currentIndex += nextBatch.length;
    }

    if (appState.currentIndex >= appState.filteredPool.length) {
      appState.hasMore = false;
      elements.endOfFeed.classList.remove('hidden');
    }

    appState.isLoading = false;
    elements.loadingSpinner.classList.add('hidden');
    updateBadge();
  }, 400);
}

// ==========================================================================
// 3. 카드 렌더링 및 UI 업데이트
// ==========================================================================

/**
 * 기사 카드들을 DOM에 추가 렌더링 (요구사항 3, 5)
 */
function renderArticles(articles, isAppend = false) {
  const fragment = document.createDocumentFragment();

  articles.forEach(article => {
    appState.displayedArticles.push(article);
    const card = createArticleCardElement(article, appState.displayedArticles.length - 1);
    fragment.appendChild(card);
  });

  if (!isAppend) {
    elements.newsGrid.innerHTML = '';
  }

  elements.newsGrid.appendChild(fragment);
}

/**
 * 개별 뉴스 카드 DOM 요소 생성
 */
function createArticleCardElement(article, index) {
  const card = document.createElement('article');
  card.className = 'news-card';
  card.setAttribute('tabindex', '0');

  const catMeta = CATEGORY_MAP[article.category] || { name: article.category, icon: '📌' };
  const imageUrl = article.og || article.fallbackImage;
  const sourceIcon = article.source_icon || 'https://www.google.com/favicon.ico';
  const sourceName = article.source || '종합 뉴스';

  card.innerHTML = `
    <div class="card-media-wrapper">
      <span class="card-category-badge ${article.category}">
        ${catMeta.icon} ${catMeta.name}
      </span>
      <img 
        class="card-image" 
        src="${escapeHtml(imageUrl)}" 
        alt="${escapeHtml(article.title)}" 
        loading="lazy"
        onerror="this.onerror=null; this.src='${article.fallbackImage}';"
      />
    </div>

    <div class="card-content">
      <div class="card-meta">
        <img class="card-source-icon" src="${escapeHtml(sourceIcon)}" alt="" onerror="this.style.display='none'">
        <span class="card-source-name">${escapeHtml(sourceName)}</span>
      </div>

      <h3 class="card-title" title="${escapeHtml(article.title)}">
        ${escapeHtml(article.title)}
      </h3>

      <div class="card-footer">
        <button class="read-btn" type="button" data-index="${index}" aria-label="기사 읽기">
          <span class="icon">📖</span>
          <span>읽기</span>
        </button>
      </div>
    </div>
  `;

  // '읽기' 버튼 클릭 시 모달 오픈 이벤트 바인딩
  const readBtn = card.querySelector('.read-btn');
  readBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openArticleModal(article);
  });

  return card;
}

/**
 * 선택된 주제 뱃지 영역 업데이트
 */
function updateActiveTopicsUI(categories) {
  elements.activeTopicsTags.innerHTML = categories.map(cat => `
    <span class="topic-tag ${cat}">
      ${CATEGORY_MAP[cat].icon} ${CATEGORY_MAP[cat].name}
    </span>
  `).join('');
}

/**
 * 기사 건수 뱃지 업데이트
 */
function updateBadge() {
  const count = appState.displayedArticles.length;
  elements.countBadge.textContent = `${count}건의 기사 표시 중`;
}

// ==========================================================================
// 4. 기사 상세 모달 제어 (요구사항 3)
// ==========================================================================

function openArticleModal(article) {
  const catMeta = CATEGORY_MAP[article.category] || { name: article.category, icon: '📌' };
  const imageUrl = article.og || article.fallbackImage;
  const sourceIcon = article.source_icon || 'https://www.google.com/favicon.ico';
  const sourceName = article.source || '주요 언론사';

  // 모달 데이터 채우기
  elements.modalCategory.className = `category-tag ${article.category}`;
  elements.modalCategory.textContent = `${catMeta.icon} ${catMeta.name}`;

  elements.modalSourceIcon.src = sourceIcon;
  elements.modalSourceName.textContent = sourceName;
  elements.modalTitle.textContent = article.title;

  elements.modalImage.src = imageUrl;
  elements.modalImage.alt = article.title;
  elements.modalImage.onerror = function() {
    this.src = article.fallbackImage;
  };

  // 상세 설명 (제목 및 주요 요약 텍스트 구성)
  elements.modalDescription.textContent = `
    [${catMeta.name} 주요 브리핑]
    
    "${article.title}"
    
    본 기사는 ${sourceName}에서 실시간으로 제공된 주요 헤드라인입니다. 상세 취재 내용과 심층 분석, 관련 인터뷰 등 전문을 확인하시려면 아래 '원문 기사 전체 읽기' 버튼을 클릭해 주세요.
  `.trim();

  elements.modalOriginalLink.href = article.link || '#';

  // 모달 열기 애니메이션
  elements.modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // 배경 스크롤 방지
}

function closeArticleModal() {
  elements.modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ==========================================================================
// 5. 유틸리티 함수 & 이벤트 리스너 초기화
// ==========================================================================

/**
 * 여러 배열을 하나씩 교차하여 섞어주는 유틸리티 (Interleaving)
 */
function interleaveArrays(arrays) {
  const result = [];
  const maxLength = Math.max(...arrays.map(arr => arr.length), 0);

  for (let i = 0; i < maxLength; i++) {
    for (let j = 0; j < arrays.length; j++) {
      if (arrays[j][i]) {
        result.push(arrays[j][i]);
      }
    }
  }
  return result;
}

/**
 * XSS 방지를 위한 HTML Escape
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 무한 스크롤 IntersectionObserver 등록
 */
function initIntersectionObserver() {
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && !appState.isLoading && appState.hasMore) {
        loadMoreArticles();
      }
    },
    {
      root: null,
      rootMargin: '200px', // 화면에 닿기 200px 전에 미리 로드
      threshold: 0.1
    }
  );

  observer.observe(elements.scrollTrigger);
}

/**
 * 이벤트 리스너 초기화
 */
function initEvents() {
  // '뉴스 보기' 버튼 클릭
  elements.fetchBtn.addEventListener('click', handleFetchNews);

  // 모달 닫기 버튼
  elements.modalCloseBtn.addEventListener('click', closeArticleModal);

  // 모달 배경 클릭 시 닫기
  elements.modal.addEventListener('click', (e) => {
    if (e.target === elements.modal) {
      closeArticleModal();
    }
  });

  // ESC 키 입력 시 모달 닫기
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elements.modal.classList.contains('hidden')) {
      closeArticleModal();
    }
  });
}

// ==========================================================================
// 앱 시작점 (Entry Point)
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initEvents();
  initIntersectionObserver();

  // 페이지 진입 시 자동으로 기본 선택(비즈니스, 스포츠) 뉴스 로드 실행
  handleFetchNews();
});
