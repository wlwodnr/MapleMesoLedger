let data = [];
let fileHandle;
let myChart;
let editIndex = -1; // 현재 인라인 편집 중인 행의 인덱스 추적 (-1은 편집 중 아님)

// 1. 파일 불러오기 및 실시간 자동 렌더링
document.getElementById('fileInput').addEventListener('click', async () => {
    try {
        [fileHandle] = await window.showOpenFilePicker({
            types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
        });
        const file = await fileHandle.getFile();
        data = JSON.parse(await file.text());
        document.getElementById('fileNameDisplay').innerText = `현재 파일: ${file.name}`;

        editIndex = -1; // 새 파일 로드 시 편집 상태 초기화
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
    if (!fileHandle) return alert("먼저 '파일 불러오기'를 진행해주세요!");
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
    try {
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    } catch (err) {
        console.error("파일 저장 오류:", err);
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
    renderTable(); // 편집 상태 레이아웃 적용을 위한 재렌더링
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

    // 데이터 복사본 배열 갱신
    data[index].category = editCategory;
    data[index].amount = editAmount;

    editIndex = -1;
    renderTable();
    updateGraph();
    await saveFile(); // 디스크 원본 파일에 실시간 반영
}

async function deleteItem(index) {
    if (!confirm("정말로 이 기록을 삭제하시겠습니까?")) return;

    data.splice(index, 1);

    // 편집 추적용 인덱스 방어 코드
    if (editIndex === index) editIndex = -1;
    else if (editIndex > index) editIndex--;

    renderTable();
    updateGraph();
    await saveFile();
}

// 8. 핵심 이중 Y축 멀티 렌더링 및 토글 제어 로직 (날짜 버그 보완본)
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

// 9. 기본 데이터 수량 갱신 및 가계부 출력 (인라인 폼 조건 분기 포함)
function renderTable() {
    document.getElementById('recordBody').innerHTML = data.map((item, index) => {
        if (editIndex === index) {
            return `
                <tr>
                    <td>${item.date}</td>
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