// ==========================================
// [추가] GoatCounter 초경량/노쿠키 방문자 통계 분석 스크립트
// ==========================================
(function () {
    const script = document.createElement('script');
    script.async = true;
    // GitHub Pages 도메인에서도 누락 없이 카운트되도록 vhost 지정을 돕는 속성입니다.
    script.setAttribute('data-goatcounter', 'https://JJU0111.goatcounter.com/count');
    script.src = '//gc.zgo.at/count.js';

    (document.head || document.body).appendChild(script);
})();

let data = [];
let fileHandle;
let myChart;
let editIndex = -1;

// ==========================================
// GitHub Pages용 순수 브라우저 내장 IndexedDB 최소화 모듈
// ==========================================
const DB_NAME = 'MapleLedgerDB';
const STORE_NAME = 'FileHandles';

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function setHandle(key, val) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(val, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getHandle(key) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(tx.error);
    });
}

// 페이지 최초 구동 및 새로고침 감지 시 구동 로직
window.addEventListener('DOMContentLoaded', async () => {
    // 1. 테이블 텍스트 데이터 복원 (LocalStorage)
    const savedData = localStorage.getItem('maple_ledger_data');
    if (savedData) {
        try {
            data = JSON.parse(savedData);
            renderTable();
            updateGraph();
        } catch (e) {
            console.error(e);
        }
    }

    // 2. 파일 쓰기 권한 구조 복원 (IndexedDB)
    try {
        const handle = await getHandle('current_handle');
        if (handle) {
            fileHandle = handle;
            document.getElementById('fileNameDisplay').innerText = `연동 파일: ${handle.name} (새로고침됨)`;
            document.getElementById('verifyBtn').style.display = 'inline-block';
        }
    } catch (err) {
        console.error("기존 파일 핸들 복원 실패:", err);
    }
});

// ⚠️ 권한 승인하기 버튼 이벤트 처리
document.getElementById('verifyBtn').addEventListener('click', async () => {
    if (!fileHandle) return;

    const opts = { mode: 'readwrite' };
    if ((await fileHandle.queryPermission(opts)) === 'granted') {
        alert("이미 권한이 승인되어 있습니다.");
        document.getElementById('verifyBtn').style.display = 'none';
        return;
    }

    try {
        if ((await fileHandle.requestPermission(opts)) === 'granted') {
            document.getElementById('fileNameDisplay').innerText = `현재 파일: ${fileHandle.name} (실시간 동기화 활성화됨)`;
            document.getElementById('verifyBtn').style.display = 'none';

            const file = await fileHandle.getFile();
            data = JSON.parse(await file.text());
            localStorage.setItem('maple_ledger_data', JSON.stringify(data));
            renderTable();
            updateGraph();
        } else {
            alert("권한이 거부되면 실시간 수정 사항이 원본 파일에 자동으로 쓰여지지 않습니다.");
        }
    } catch (err) {
        alert("권한 승인 도중 오류가 발생했습니다. 파일을 다시 불러와주세요.");
        console.error(err);
    }
});

// 1. 기존 파일 불러오기 버튼 (클릭 방식)
document.getElementById('fileInput').addEventListener('click', async () => {
    try {
        [fileHandle] = await window.showOpenFilePicker({
            types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
        });
        const file = await fileHandle.getFile();
        data = JSON.parse(await file.text());
        document.getElementById('fileNameDisplay').innerText = `현재 파일: ${file.name} (실시간 동기화 활성화)`;
        document.getElementById('verifyBtn').style.display = 'none';

        localStorage.setItem('maple_ledger_data', JSON.stringify(data));
        await setHandle('current_handle', fileHandle);

        editIndex = -1;
        renderTable();
        updateGraph();
    } catch (err) {
        console.error("파일 로드 취소 또는 오류:", err);
    }
});

// 2. 내보내기 기능
document.getElementById('exportBtn').addEventListener('click', () => {
    if (data.length === 0) return alert("내보낼 데이터가 없습니다.");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '메이플_가계부.json';
    a.click();
    URL.revokeObjectURL(url);
});

// 3. 기록 추가
document.getElementById('addBtn').addEventListener('click', async () => {
    const category = document.getElementById('category').value;
    const amount = document.getElementById('amount').value;

    if (!amount) return alert("수량을 입력하세요.");

    data.push({
        date: new Date().toLocaleDateString(),
        category: category,
        amount: Number(amount)
    });

    renderTable();
    updateGraph();
    await saveFile();
});

// 4. 파일 실시간 덮어쓰기 저장
async function saveFile() {
    localStorage.setItem('maple_ledger_data', JSON.stringify(data));

    if (!fileHandle) {
        console.log("자동 복원 모드 작동 중");
        return;
    }
    try {
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        console.log("원본 파일에 실시간 반영 완료!");
    } catch (err) {
        console.error("실시간 오버라이트 실패:", err);
        document.getElementById('verifyBtn').style.display = 'inline-block';
    }
}

// 5. 상단 대시보드 조각값 적용 및 연동 버튼
document.getElementById('calcBtn').addEventListener('click', () => {
    calculateTotalProfit();
    updateGraph();
});

// 6. 입력값 변경 및 토글 작동 시 실시간 그래프 리액션 등록
document.getElementById('useZogakCalc').addEventListener('change', updateGraph);
document.getElementById('pricePerZogak').addEventListener('input', updateGraph);
document.getElementById('showGraphBtn').addEventListener('click', updateGraph);
document.getElementById('periodFilter').addEventListener('change', updateGraph);

// 7. 인라인 수정/삭제 핸들러 함수군
function startEdit(index) {
    editIndex = index;
    renderTable();
}

function cancelEdit() {
    editIndex = -1;
    renderTable();
}

async function saveEdit(index) {
    const editCategory = document.getElementById(`editCategory_${index}`).value;
    const editAmount = Number(document.getElementById(`editAmount_${index}`).value);

    if (isNaN(editAmount) || editAmount <= 0) {
        alert("올바른 수량을 입력해 주세요.");
        return;
    }

    data[index].category = editCategory;
    data[index].amount = editAmount;

    editIndex = -1;
    renderTable();
    updateGraph();
    await saveFile();
}

async function deleteItem(index) {
    if (!confirm("정말로 이 기록을 삭제하시겠습니까?")) return;

    data.splice(index, 1);

    if (editIndex === index) editIndex = -1;
    else if (editIndex > index) editIndex--;

    renderTable();
    updateGraph();
    await saveFile();
}

// 8. 그래프 제어 로직
function updateGraph() {
    const days = Number(document.getElementById('periodFilter').value);
    const useCalc = document.getElementById('useZogakCalc').checked;
    const pricePerZogak = Number(document.getElementById('pricePerZogak').value) || 0;

    const step = days === 7 ? 1 : (days === 30 ? 3 : 6);
    const labels = [], mesoValues = [], zogakValues = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days; i >= 0; i -= step) {
        let startDate = new Date(today);
        startDate.setDate(today.getDate() - i);

        let endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + step);

        labels.push(startDate.toLocaleDateString().slice(5));

        const filtered = data.filter(item => {
            const itemDateStr = item.date.replace(/\s/g, '');
            const itemDate = new Date(itemDateStr);
            itemDate.setHours(0, 0, 0, 0);
            return itemDate >= startDate && itemDate < endDate;
        });

        const dailyMeso = filtered.filter(item => item.category === '메소').reduce((sum, item) => sum + item.amount, 0);
        const dailyZogak = filtered.filter(item => item.category === '조각').reduce((sum, item) => sum + item.amount, 0);

        mesoValues.push(useCalc ? dailyMeso + (dailyZogak * pricePerZogak) : dailyMeso);
        zogakValues.push(dailyZogak);
    }

    if (myChart) myChart.destroy();

    const datasets = [
        {
            label: useCalc ? '통합 예상 수익 (메소)' : '순수 메소 수익',
            data: mesoValues,
            yAxisID: 'yMeso',
            backgroundColor: useCalc ? '#a855f7' : '#6366f1',
            borderRadius: 6
        }
    ];

    if (!useCalc) {
        datasets.push({
            label: '순수 조각 수량',
            data: zogakValues,
            yAxisID: 'yZogak',
            backgroundColor: '#0ea5e9',
            borderRadius: 6
        });
    }

    const ctx = document.getElementById('myChart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                yMeso: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: '메소 단위 (Meso)' },
                    ticks: { callback: value => value.toLocaleString() }
                },
                yZogak: {
                    type: 'linear',
                    position: 'right',
                    display: !useCalc,
                    title: { display: true, text: '조각 개수 (개)' },
                    grid: { drawOnChartArea: false },
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// 9. 기록 테이블 렌더링
function renderTable() {
    document.getElementById('recordBody').innerHTML = data.map((item, index) => {
        const iconPath = item.category === '메소' ? 'IconImage/Meso.png' : 'IconImage/Pice of Erda.png';
        const imgTag = `<img src="${iconPath}" class="ledger-icon" alt="${item.category}">`;

        if (editIndex === index) {
            return `
                <tr>
                    <td>${item.date}</td>
                    <td class="icon-cell"></td>
                    <td>
                        <select id="editCategory_${index}" class="table-input">
                            <option value="메소" ${item.category === '메소' ? 'selected' : ''}>메소</option>
                            <option value="조각" ${item.category === '조각' ? 'selected' : ''}>조각</option>
                        </select>
                    </td>
                    <td>
                        <input type="number" id="editAmount_${index}" value="${item.amount}" class="table-input">
                    </td>
                    <td>
                        <button onclick="saveEdit(${index})" class="btn-sm btn-edit">저장</button>
                        <button onclick="cancelEdit()" class="btn-sm btn-cancel">취소</button>
                    </td>
                </tr>
            `;
        }

        return `
            <tr>
                <td>${item.date}</td>
                <td class="icon-cell">${imgTag}</td>
                <td>${item.category}</td>
                <td>${item.amount.toLocaleString()}</td>
                <td>
                    <button onclick="startEdit(${index})" class="btn-sm btn-edit">✏️ 수정</button>
                    <button onclick="deleteItem(${index})" class="btn-sm btn-delete">❌ 삭제</button>
                </td>
            </tr>
        `;
    }).join('');

    const totalMeso = data.filter(i => i.category === '메소').reduce((sum, i) => sum + i.amount, 0);
    const totalZogak = data.filter(i => i.category === '조각').reduce((sum, i) => sum + i.amount, 0);

    document.getElementById('totalMeso').innerText = totalMeso.toLocaleString();
    document.getElementById('totalZogak').innerText = totalZogak.toLocaleString();

    calculateTotalProfit();
}

function calculateTotalProfit() {
    const pricePerZogak = Number(document.getElementById('pricePerZogak').value) || 0;
    const totalMeso = data.filter(i => i.category === '메소').reduce((sum, i) => sum + i.amount, 0);
    const totalZogak = data.filter(i => i.category === '조각').reduce((sum, i) => sum + i.amount, 0);
    const totalProfit = totalMeso + (totalZogak * pricePerZogak);

    document.getElementById('totalProfit').innerText = totalProfit.toLocaleString();
}

// ==========================================
// 10. [버그 완전 해결] 드래그 앤 드롭 글로벌 가로채기 방지 리스너
// ==========================================
const dropZone = document.getElementById('dropZone');

document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.display = 'flex';
});

document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.display = 'flex';
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === dropZone) {
        dropZone.style.display = 'none';
    }
});

function readDroppedFile(file, isHandleMode = false) {
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            data = JSON.parse(event.target.result);
            localStorage.setItem('maple_ledger_data', JSON.stringify(data));

            if (isHandleMode) {
                document.getElementById('fileNameDisplay').innerText = `현재 파일: ${file.name} (실시간 동기화 활성화)`;
                document.getElementById('verifyBtn').style.display = 'none';
            } else {
                fileHandle = null;
                document.getElementById('fileNameDisplay').innerText = `현재 파일: ${file.name} (실시간 동기화 미활성화 - 수정 후 내보내기 필요)`;
                document.getElementById('verifyBtn').style.display = 'none';
            }
            editIndex = -1;
            renderTable();
            updateGraph();
        } catch (err) {
            alert("JSON 파일 내부 형식이 유효하지 않습니다.");
        }
    };
    reader.readAsText(file);
}

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.display = 'none';

    if (e.dataTransfer.items && e.dataTransfer.items[0]) {
        const item = e.dataTransfer.items[0];
        if (typeof item.getAsFileSystemHandle === 'function') {
            try {
                const handle = await item.getAsFileSystemHandle();
                if (handle.kind === 'file') {
                    if (!handle.name.endsWith('.json')) {
                        alert("가계부용 JSON 형식의 파일만 드롭해 주세요!");
                        return;
                    }
                    fileHandle = handle;
                    const file = await fileHandle.getFile();
                    await setHandle('current_handle', fileHandle);

                    readDroppedFile(file, true);
                    return;
                }
            } catch (err) {
                console.warn("보안 제약으로 파일 핸들러 추출을 우회하여 표준 모드로 전환합니다.");
            }
        }
    }

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (!file.name.endsWith('.json')) {
            alert("가계부용 JSON 형식의 파일만 드롭해 주세요!");
            return;
        }
        readDroppedFile(file, false);
    }
});