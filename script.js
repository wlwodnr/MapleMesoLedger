let data = [];
let fileHandle;
let myChart;
let editIndex = -1; // 현재 인라인 편집 중인 행의 인덱스 추적 (-1은 편집 중 아님)

// 1. 기존 파일 불러오기 버튼 (클릭 방식)
document.getElementById('fileInput').addEventListener('click', async () => {
    try {
        [fileHandle] = await window.showOpenFilePicker({
            types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
        });
        const file = await fileHandle.getFile();
        data = JSON.parse(await file.text());
        document.getElementById('fileNameDisplay').innerText = `현재 파일: ${file.name}`;

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

// 3. 기록 추가 (추가 즉시 saveFile 실행)
document.getElementById('addBtn').addEventListener('click', async () => {
    if (data.length === 0 && !fileHandle) return alert("먼저 파일을 불러오거나 드롭하여 연동해주세요!");
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
    await saveFile(); // 실시간 저장 연동
});

// 4. 파일 실시간 덮어쓰기 저장
async function saveFile() {
    if (!fileHandle) {
        console.log("파일 핸들이 확보되지 않아 실시간 저장을 스킵합니다.");
        return;
    }
    try {
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        console.log("원본 파일에 실시간 자동 저장 완료!");
    } catch (err) {
        console.error("파일 저장 오류 (권한 미승인 등):", err);
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
    await saveFile(); // 수정 즉시 자동 실시간 저장
}

async function deleteItem(index) {
    if (!confirm("정말로 이 기록을 삭제하시겠습니까?")) return;

    data.splice(index, 1);

    if (editIndex === index) editIndex = -1;
    else if (editIndex > index) editIndex--;

    renderTable();
    updateGraph();
    await saveFile(); // 삭제 즉시 자동 실시간 저장
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
// 10. [수정 완료] 드래그 앤 드롭 핸들러 추출 및 실시간 오버라이트 연동 로직
// ==========================================
const dropZone = document.getElementById('dropZone');

window.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.display = 'flex';
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.style.display = 'none';
});

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.style.display = 'none';

    // e.dataTransfer.items 가 존재하고 DataTransferItem 객체가 유효한지 체크
    if (e.dataTransfer.items && e.dataTransfer.items[0]) {
        const item = e.dataTransfer.items[0];

        // 브라우저의 최신 File System Access API 기능으로 아이템을 파일 핸들러로 다이렉트 변환
        if (typeof item.getAsFileSystemHandle === 'function') {
            try {
                const handle = await item.getAsFileSystemHandle();

                // 디렉토리가 아닌 순수 파일일 경우에만 바인딩
                if (handle.kind === 'file') {
                    if (!handle.name.endsWith('.json')) {
                        alert("가계부용 JSON 형식의 파일만 드롭해 주세요!");
                        return;
                    }

                    // 글로벌 파일 핸들 변수에 주소 이식 (이로써 쓰기 권한 통로 개방)
                    fileHandle = handle;

                    const file = await fileHandle.getFile();
                    data = JSON.parse(await file.text());

                    document.getElementById('fileNameDisplay').innerText = `현재 파일: ${file.name} (실시간 동기화 자동저장 중)`;
                    editIndex = -1;
                    renderTable();
                    updateGraph();
                    return;
                }
            } catch (err) {
                console.error("드롭 파일 핸들 획득 실패, 일반 리더 모드로 폴백:", err);
            }
        }
    }

    // 최신 API가 지원되지 않는 구형 환경일 때를 위한 예외 안전장치 (폴백 코드)
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (!file.name.endsWith('.json')) {
            alert("가계부용 JSON 형식의 파일만 드롭해 주세요!");
            return;
        }
        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                data = JSON.parse(event.target.result);
                fileHandle = null; // 핸들러를 얻지 못했으므로 덮어쓰기 비활성화
                document.getElementById('fileNameDisplay').innerText = `현재 파일(읽기전용): ${file.name} (수정 후 내보내기 필요)`;
                editIndex = -1;
                renderTable();
                updateGraph();
            } catch (err) {
                alert("JSON 파일 내부 형식이 유효하지 않습니다.");
            }
        };
        reader.readAsText(file);
    }
});