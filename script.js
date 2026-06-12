let data = [];
let fileHandle;
let myChart;

// 1. 파일 불러오기 및 실시간 자동 렌더링
document.getElementById('fileInput').addEventListener('click', async () => {
    try {
        [fileHandle] = await window.showOpenFilePicker({
            types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
        });
        const file = await fileHandle.getFile();
        data = JSON.parse(await file.text());
        document.getElementById('fileNameDisplay').innerText = `현재 파일: ${file.name}`;

        renderTable();
        updateGraph(); // 로드 즉시 그래프 자동 생성
    } catch (err) {
        console.error("파일 로드 취소 또는 오류:", err);
    }
});

// 2. 내보내기 기능 (지정한 파일명 반영)
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

// 3. 기록 추가 (추가 시 그래프 및 수치 자동 업데이트)
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
    updateGraph(); // 기록 추가 즉시 반영
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
    updateGraph(); // 가치 환산 금액 적용 후 그래프 동시 업데이트
});

// 6. 입력값 변경 및 토글 작동 시 실시간 그래프 리액션 등록
document.getElementById('useZogakCalc').addEventListener('change', updateGraph);
document.getElementById('pricePerZogak').addEventListener('input', updateGraph);
document.getElementById('showGraphBtn').addEventListener('click', updateGraph);
document.getElementById('periodFilter').addEventListener('change', updateGraph);

// 7. 핵심 이중 Y축 멀티 렌더링 및 토글 제어 로직
function updateGraph() {
    const days = Number(document.getElementById('periodFilter').value);
    const useCalc = document.getElementById('useZogakCalc').checked;
    const pricePerZogak = Number(document.getElementById('pricePerZogak').value) || 0;

    const step = days === 7 ? 1 : (days === 30 ? 3 : 6);
    const labels = [], mesoValues = [], zogakValues = [];
    const today = new Date();

    for (let i = days; i >= 0; i -= step) {
        let target = new Date();
        target.setDate(today.getDate() - i);
        labels.push(target.toLocaleDateString().slice(5));

        const filtered = data.filter(item => {
            let diff = (today - new Date(item.date)) / (1000 * 60 * 60 * 24);
            return diff <= i && diff > (i - step);
        });

        const dailyMeso = filtered.filter(item => item.category === '메소').reduce((sum, item) => sum + item.amount, 0);
        const dailyZogak = filtered.filter(item => item.category === '조각').reduce((sum, item) => sum + item.amount, 0);

        // [토글 ON] 일때는 조각 가치를 메소 막대에 더하고, [토글 OFF] 일때는 순수 메소만 할당
        mesoValues.push(useCalc ? dailyMeso + (dailyZogak * pricePerZogak) : dailyMeso);
        zogakValues.push(dailyZogak);
    }

    if (myChart) myChart.destroy();

    // 토글 스위치 켜짐 유무에 따른 동적 데이터셋 빌드 생성
    const datasets = [
        {
            label: useCalc ? '통합 예상 수익 (메소)' : '순수 메소 수익',
            data: mesoValues,
            yAxisID: 'yMeso',
            backgroundColor: useCalc ? '#a855f7' : '#6366f1',
            borderRadius: 6
        }
    ];

    // 토글 미포함(OFF) 상태일 때만 우측 축을 쓰는 '조각 막대'를 배열에 추가
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
                    display: !useCalc, // 토글 통합 모드일 때는 우측 조각 축 자체를 숨김
                    title: { display: true, text: '조각 개수 (개)' },
                    grid: { drawOnChartArea: false }, // 격자선 겹침 방지
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// 8. 기본 데이터 수량 갱신 및 가계부 출력
function renderTable() {
    document.getElementById('recordBody').innerHTML = data.map(item => `
        <tr><td>${item.date}</td><td>${item.category}</td><td>${item.amount.toLocaleString()}</td></tr>
    `).join('');

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