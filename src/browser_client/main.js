import { processData, WebRTCCommUtils } from './client.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const trainDataInput   = document.getElementById('train-data-input');
  const testDataInput    = document.getElementById('test-data-input');
  const startButton      = document.getElementById('start-button');
  const consoleOutput    = document.getElementById('console-output');
  const saveConfigButton = document.getElementById('save-config-button');
  const fileDropdown     = document.getElementById('fileDropdown');

  // Default config (overridable via form)
  const config = {
    signaling_server : localStorage.getItem('signalingServer') || 'ws://localhost:8765',
    algos            : { node_0: { topology: localStorage.getItem('topology') || 'ring' } },
    num_users        : +localStorage.getItem('numUsers') || 3,
    session_id       : localStorage.getItem('sessionId') || '1111',
    epochs           : +localStorage.getItem('epochs') || 10,
    num_collaborators: +localStorage.getItem('numCollaborators') || 1,
    joinActiveSession: localStorage.getItem('joinActiveSession') || false,
  };

  let trainDataset = null;
  let testDataset  = null;

  // Log helper
  function displayMessage(msg) {
    const div = document.createElement('div');
    div.textContent = msg;
    consoleOutput.appendChild(div);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

// Add sample partitions to dropdown
samplePartitions.forEach(file => {
    const option = document.createElement('option');
    option.value = file;
    option.textContent = file;
    fileDropdown.appendChild(option);
});

function disableButtons() {
    trainDataInput.disabled = true;
    testDataInput.disabled = true;
    fileDropdown.disabled = true;
    startButton.disabled = true;
    saveConfigButton.disabled = true;
}

function enableButtons() {
    trainDataInput.disabled = false;
    testDataInput.disabled = false;
    fileDropdown.disabled = false;
    startButton.disabled = trainDataset === null; // Only enable if training data exists
    saveConfigButton.disabled = false;
    startButton.disabled      = (trainDataset === null);
  }

  // Populate sample dropdown
  for (let i = 0; i < 10; i++) {
    const opt = document.createElement('option');
    opt.value = opt.textContent = `cifar10_client_${i}_test.json`;
    fileDropdown.appendChild(opt);
  }

saveConfigButton.addEventListener('click', function() {
    config.algos.node_0.topology = document.getElementById('topology').value;
    config.signaling_server = document.getElementById('signaling_server').value;
    config.num_users = document.getElementById('num_users').value;
    config.session_id = document.getElementById('session_id').value;
    config.epochs = document.getElementById('epochs').value;
    config.num_collaborators = document.getElementById('num_collaborators').value;
    config.joinActiveSession = document.getElementById('join_active_session').checked;
    
    // Save to localStorage for persistence
    localStorage.setItem('topology', config.algos.node_0.topology);
    localStorage.setItem('signalingServer', config.signaling_server);
    localStorage.setItem('numUsers', config.num_users);
    localStorage.setItem('sessionId', config.session_id);
    localStorage.setItem('epochs', config.epochs);
    localStorage.setItem('numCollaborators', config.num_collaborators);
    localStorage.setItem('joinActiveSession', config.joinActiveSession);
    
    displayMessage('Config Saved:');
    displayMessage(JSON.stringify(config, null, 2));
    if (trainDataset) startButton.disabled = false;
  });

  // Data loading & splitting logic (unchanged)…
  trainDataInput.addEventListener('change', /* … */);
  testDataInput.addEventListener('change', /* … */);
  fileDropdown.addEventListener('change',  /* … */);
  function splitDataset(dataset, ratio = 0.8) { /* … */ }

  // ─── Graph Overlay & Chart.js Setup ────────────────────────────────────────
  (function setupGraph() {
    // Create overlay if not present
    let overlay = document.querySelector('.graph-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'graph-overlay';
      overlay.innerHTML = `
        <div class="graph-container">
          <button class="close-graph">&times;</button>
          <canvas id="trainingChart"></canvas>
        </div>`;
      document.body.appendChild(overlay);
    }

    // Open/close controls
    document.getElementById('show-graph-btn')
      .addEventListener('click', () => overlay.classList.add('active'));
    overlay.querySelector('.close-graph')
      .addEventListener('click', () => overlay.classList.remove('active'));

    // Wait for Chart.js to load, then init a single-series “Test Accuracy” chart
    let chart;
    function initChart() {
      if (!window.Chart) return setTimeout(initChart, 100);
      const ctx = document.getElementById('trainingChart').getContext('2d');
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Test Accuracy',
            data: [],
            borderColor: '#2a7fff',
            borderWidth: 2,
            fill: false
          }]
        },
        options: {
          animation: false,
          responsive: true,
          scales: {
            x: { title: { display: true, text: 'Epoch' } },
            y: {
              title: { display: true, text: 'Accuracy' },
              ticks: {
                callback: v => (v * 100).toFixed(0) + '%'
              }
            }
          }
        }
      });
    }

    if (!window.Chart) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      s.onload = initChart;
      document.head.appendChild(s);
    } else {
      initChart();
    }

    // Expose updateTestAccuracy
    window.updateTestAccuracy = (epoch, accuracy) => {
      if (!chart) return;
      chart.data.labels.push(epoch);
      chart.data.datasets[0].data.push(accuracy);
      chart.update('none');
    };
  })();

  // ─── Start training & wire accuracy into the chart ─────────────────────────
  startButton.addEventListener('click', () => {
    disableControls();
    if (!trainDataset) {
      displayMessage('Error: Training data not loaded');
      enableControls();
      return;
    }
    let finalTrain = trainDataset, finalTest = testDataset;
    if (!testDataset) {
      displayMessage('Splitting 80/20…');
      const { trainData, testData } = splitDataset(trainDataset);
      finalTrain = trainData; finalTest = testData;
      displayMessage(`Split: ${finalTrain.images.length} train, ${finalTest.images.length} test`);
    }
    displayMessage(`Starting training (${finalTrain.images.length} train, ${finalTest.images.length} test)`);
    const node = new WebRTCCommUtils(config, finalTrain, finalTest);

    // Push test accuracy whenever a 'progress' event fires
    if (typeof node.on === 'function') {
      node.on('progress', ({ step, accuracy }) => {
        if (window.updateTestAccuracy) {
          updateTestAccuracy(step, accuracy);
        }
      });
    }
  });

  // ─── Prefill form logic (unchanged) ─────────────────────────────────────────
  (function prefillForm() {
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) return;
    document.getElementById('session_id').value = sessionId;
    ['topology','signalingServer','numUsers','epochs','numCollaborators'].forEach(key => {
      const val = localStorage.getItem(key);
      if (val !== null) {
        const el = document.getElementById(
          key === 'topology'         ? 'topology' :
          key === 'signalingServer'   ? 'signaling_server' :
          key === 'numUsers'          ? 'num_users' :
          key === 'epochs'            ? 'epochs' :
                                       'num_collaborators'
        );
        if (el) el.value = val;
      }
    });
    const form = document.getElementById('config-form');
    form.classList.add('pre-filled');
    const note = document.createElement('div');
    note.className = 'notification';
    note.innerHTML = `<i class="fas fa-info-circle"></i> Form pre-filled from session ${sessionId}`;
    form.parentNode.insertBefore(note, form);
    setTimeout(() => note.style.opacity = 0, 5000);
  })();
});
