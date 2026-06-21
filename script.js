(function () {
    const script = document.createElement('script');
    script.async = true;
    script.setAttribute('data-goatcounter', 'https://JJU0111.goatcounter.com/count');
    script.src = '//gc.zgo.at/count.js';
    (document.head || document.body).appendChild(script);
})();

let data = [];
let fileHandle;
let myChart;
let editIndex = -1;
let sellIndex = -1; // 판매 UI 토글용 인덱스

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

function formatKoreanUnit(num, category) {
    if (!num || isNaN(num) || num <= 0) return "";
    if (category === '조각') {
        return `(${num.toLocaleString()} 개)`;
    }
    let result = [];
    const jo = Math.floor(num / 1000000000000);
    const eok = Math.floor((num % 1000000000000) / 100000000);
    const man = Math.floor((num % 100000000) / 10000);
    const won = num % 10000;

    if (jo > 0) result.push(`${jo}조`);
    if (eok > 0) result.push(`${eok}억`);
    if (man > 0) result.push(`${man}만`);
    if (won > 0 && result.length === 0) result.push(`${won}`);

    return result.length > 0 ? `(${result.join(' ')} 메소)` : "";
}

function updateAmountUnitDisplay() {
    const amountInput = document.getElementById('amount');
    const categorySelect = document.getElementById('category');
    const unitDisplay = document.getElementById('amountUnit');
    const value = Number(amountInput.value);
    const category = categorySelect.value;
    unitDisplay.innerText = formatKoreanUnit(value, category);
}

// 인라인 판매 기입 블록의 단위 실시간 업데이트 핸들러
function updateSellUnitDisplay(index) {
    const inputEl = document.getElementById(`sellPriceInput_${index}`);
    const unitEl = document.getElementById(`sellPriceUnitText_${index}`);
    if (!inputEl || !unitEl) return;

    const value = Number(inputEl.value);
    unitEl.innerText = formatKoreanUnit(value, '메소');
}

window.addEventListener('DOMContentLoaded', async () => {
    const todayStr = new Date().toISOString().substring(0, 10);
    document.getElementById('recordDate').value = todayStr;

    const savedData = localStorage.getItem('maple_ledger_data');
    if (savedData) {
        try {
            data = JSON.parse(savedData);
            data = data.map(item => ({ type: '수입', ...item }));
            renderTable();
            updateGraph();
        } catch (e) {
            console.error(e);
        }
    }

    document.getElementById('amount').addEventListener('input', updateAmountUnitDisplay);
    document.getElementById('category').addEventListener('change', updateAmountUnitDisplay);

    document.getElementById('tableFilter').addEventListener('change', renderTable);
    document.getElementById('tableSort').addEventListener('change', renderTable);

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
            data = data.map(item => ({ type: '수입', ...item }));
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

document.getElementById('fileInput').addEventListener('click', async () => {
    try {
        [fileHandle] = await window.showOpenFilePicker({
            types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
        });
        const file = await fileHandle.getFile();
        data = JSON.parse(await file.text());
        data = data.map(item => ({ type: '수입', ...item }));
        document.getElementById('fileNameDisplay').innerText = `현재 파일: ${file.name} (실시간 동기화 활성화)`;
        document.getElementById('verifyBtn').style.display = 'none';

        localStorage.setItem('maple_ledger_data', JSON.stringify(data));
        await setHandle('current_handle', fileHandle);

        editIndex = -1;
        sellIndex = -1;
        renderTable();
        updateGraph();
    } catch (err) {
        console.error("파일 로드 취소 또는 오류:", err);
    }
});

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

document.getElementById('addBtn').addEventListener('click', async () => {
    const dateInput = document.getElementById('recordDate').value;
    const txType = document.getElementById('transactionType').value;
    const category = document.getElementById('category').value;
    const amount = document.getElementById('amount').value;

    if (!amount) return alert("수량을 입력하세요.");

    const formattedDate = dateInput ? new Date(dateInput).toLocaleDateString() : new Date().toLocaleDateString();

    data.push({
        date: formattedDate,
        type: txType,
        category: category,
        amount: Number(amount)
    });

    document.getElementById('amount').value = "";
    document.getElementById('amountUnit').innerText = "";

    renderTable();
    updateGraph();
    await saveFile();
});

async function saveFile() {
    localStorage.setItem('maple_ledger_data', JSON.stringify(data));
    if (!fileHandle) return;
    try {
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    } catch (err) {
        console.error("실시간 오버라이트 실패:", err);
        document.getElementById('verifyBtn').style.display = 'inline-block';
    }
}

document.getElementById('calcBtn').addEventListener('click', () => {
    calculateTotalProfit();
    updateGraph();
});

document.getElementById('useZogakCalc').addEventListener('change', updateGraph);
document.getElementById('pricePerZogak').addEventListener('input', updateGraph);
document.getElementById('showGraphBtn').addEventListener('click', updateGraph);
document.getElementById('periodFilter').addEventListener('change', updateGraph);

function startEdit(index) {
    editIndex = index;
    sellIndex = -1; // 수정 돌입 시 판매 창 닫기
    renderTable();
}

function cancelEdit() {
    editIndex = -1;
    renderTable();
}

async function saveEdit(index) {
    const editType = document.getElementById(`editType_${index}`).value;
    const editCategory = document.getElementById(`editCategory_${index}`).value;
    const editAmount = Number(document.getElementById(`editAmount_${index}`).value);

    if (isNaN(editAmount) || editAmount <= 0) {
        alert("올바른 수량을 입력해 주세요.");
        return;
    }

    data[index].type = editType;
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
    if (sellIndex === index) sellIndex = -1;
    else if (sellIndex > index) sellIndex--;
    renderTable();
    updateGraph();
    await saveFile();
}

// 판매 기입 블록 토글 제어
function toggleSellBlock(index) {
    if (sellIndex === index) {
        sellIndex = -1;
    } else {
        sellIndex = index;
        editIndex = -1; // 판매 진입 시 인라인 수정창 닫기
    }
    renderTable();
}

// 기입 블록 내부 최종 판매 정산 처리 함수
async function submitSellZogak(index) {
    const priceInputEl = document.getElementById(`sellPriceInput_${index}`);
    if (!priceInputEl) return;

    const pricePerUnit = Number(priceInputEl.value);
    if (isNaN(pricePerUnit) || pricePerUnit <= 0) {
        alert("올바른 개당 가격을 입력해주세요.");
        return;
    }

    const item = data[index];
    const totalMesoAmount = Math.floor(item.amount * pricePerUnit * 0.95);

    data[index].category = '메소';
    data[index].type = '수입';
    data[index].amount = totalMesoAmount;

    sellIndex = -1;
    renderTable();
    updateGraph();
    await saveFile();
}

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

        const dailyMeso = filtered.filter(item => item.category === '메소').reduce((sum, item) => {
            return sum + (item.type === '소모' ? -item.amount : item.amount);
        }, 0);

        const dailyZogak = filtered.filter(item => item.category === '조각').reduce((sum, item) => {
            return sum + (item.type === '소모' ? -item.amount : item.amount);
        }, 0);

        mesoValues.push(useCalc ? dailyMeso + (dailyZogak * pricePerZogak) : dailyMeso);
        zogakValues.push(dailyZogak);
    }

    if (myChart) myChart.destroy();

    const datasets = [
        {
            label: useCalc ? '통합 순수익 (메소)' : '메소 변동량',
            data: mesoValues,
            yAxisID: 'yMeso',
            backgroundColor: useCalc ? '#a855f7' : '#6366f1',
            borderRadius: 6
        }
    ];

    if (!useCalc) {
        datasets.push({
            label: '조각 변동량',
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

function renderTable() {
    const filterValue = document.getElementById('tableFilter').value;
    const sortValue = document.getElementById('tableSort').value;

    let processedData = data.map((item, originalIndex) => ({ ...item, originalIndex }));

    if (filterValue === '메소') {
        processedData = processedData.filter(item => item.category === '메소');
    } else if (filterValue === '조각') {
        processedData = processedData.filter(item => item.category === '조각');
    }

    if (sortValue === '최신순') {
        processedData.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else if (sortValue === '금액높은순') {
        processedData.sort((a, b) => b.amount - a.amount);
    } else if (sortValue === '금액낮은순') {
        processedData.sort((a, b) => a.amount - b.amount);
    }

    let htmlRows = [];

    processedData.forEach((item) => {
        const index = item.originalIndex;
        const iconPath = item.category === '메소' ? 'IconImage/Meso.png' : 'IconImage/Pice of Erda.png';
        const imgTag = `<img src="${iconPath}" class="ledger-icon" alt="${item.category}">`;
        const isIncome = item.type !== '소모';
        const typeClass = isIncome ? 'type-income' : 'type-expense';
        const sign = isIncome ? '+' : '-';

        const sellButtonTag = item.category === '조각'
            ? `<button onclick="toggleSellBlock(${index})" class="btn-sm btn-sell">💰 판매</button>`
            : '';

        if (editIndex === index) {
            htmlRows.push(`
                <tr>
                    <td>${item.date}</td>
                    <td class="icon-cell"></td>
                    <td>
                        <select id="editType_${index}" class="table-input">
                            <option value="수입" ${item.type === '수입' ? 'selected' : ''}>수입</option>
                            <option value="소모" ${item.type === '소모' ? 'selected' : ''}>소모</option>
                        </select>
                    </td>
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
            `);
        } else {
            htmlRows.push(`
                <tr>
                    <td>${item.date}</td>
                    <td class="icon-cell">${imgTag}</td>
                    <td class="${typeClass}" style="font-weight:bold;">${item.type}</td>
                    <td>${item.category}</td>
                    <td class="${typeClass}" style="font-weight:bold;">${sign} ${item.amount.toLocaleString()}</td>
                    <td>
                        <button onclick="startEdit(${index})" class="btn-sm btn-edit">✏️ 수정</button>
                        <button onclick="deleteItem(${index})" class="btn-sm btn-delete">❌ 삭제</button>
                        ${sellButtonTag}
                    </td>
                </tr>
            `);
        }

        // 🛠️ 판매 기입 블록UI 렌더링 영역 추가 (해당 조각의 판매 창이 열려있을 때)
        if (sellIndex === index && item.category === '조각') {
            htmlRows.push(`
                <tr class="sell-block-row">
                    <td colspan="6">
                        <div class="sell-input-container">
                            <div class="sell-title">💰 조각 판매 정산 (5% 수수료 자동 적용)</div>
                            <div class="sell-body">
                                <div class="sell-field">
                                    <input type="number" id="sellPriceInput_${index}" class="sell-price-input" placeholder="개당 판매 메소 가격 입력" oninput="updateSellUnitDisplay(${index})">
                                    <span id="sellPriceUnitText_${index}" class="sell-unit-text"></span>
                                </div>
                                <div class="sell-actions">
                                    <button onclick="submitSellZogak(${index})" class="btn-sm btn-sell">정산 완료</button>
                                    <button onclick="toggleSellBlock(${index})" class="btn-sm btn-cancel">닫기</button>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `);
        }
    });

    document.getElementById('recordBody').innerHTML = htmlRows.join('');

    const totalMeso = data.filter(i => i.category === '메소').reduce((sum, i) => sum + (i.type === '소모' ? -i.amount : i.amount), 0);
    const totalZogak = data.filter(i => i.category === '조각').reduce((sum, i) => sum + (i.type === '소모' ? -i.amount : i.amount), 0);

    document.getElementById('totalMeso').innerText = totalMeso.toLocaleString();
    document.getElementById('totalZogak').innerText = totalZogak.toLocaleString();

    calculateTotalProfit();
}

function calculateTotalProfit() {
    const pricePerZogak = Number(document.getElementById('pricePerZogak').value) || 0;
    const totalMeso = data.filter(i => i.category === '메소').reduce((sum, i) => sum + (i.type === '소모' ? -i.amount : i.amount), 0);
    const totalZogak = data.filter(i => i.category === '조각').reduce((sum, i) => sum + (i.type === '소모' ? -i.amount : i.amount), 0);
    const totalProfit = totalMeso + (totalZogak * pricePerZogak);

    document.getElementById('totalProfit').innerText = totalProfit.toLocaleString();
}

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
            data = data.map(item => ({ type: '수입', ...item }));
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
            sellIndex = -1;
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