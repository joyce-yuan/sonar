import { processData, WebRTCCommUtils } from './client.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const trainDataInput   = document.getElementById('train-data-input');
  const testDataInput    = document.getElementById('test-data-input');
  const startButton      = document.getElementById('start-button');
  const consoleOutput    = document.getElementById('console-output');
  const saveConfigButton = document.getElementById('save-config-button');
  const fileDropdown     = document.getElementById('fileDropdown');

  // Default config (overridable)
  const config = {
    signaling_server : localStorage.getItem('signalingServer') || 'ws://localhost:8765',
    algos            : { node_0: { topology: localStorage.getItem('topology') || 'ring' } },
    num_users        : +localStorage.getItem('numUsers') || 3,
    session_id       : localStorage.getItem('sessionId') || '1111',
    epochs           : +localStorage.getItem('epochs') || 10,
    num_collaborators: +localStorage.getItem('numCollaborators') || 1
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

  // Enable/disable UI
  function disableControls() {
    [ trainDataInput, testDataInput, fileDropdown, startButton, saveConfigButton ]
      .forEach(el => el.disabled = true);
  }
  function enableControls() {
    trainDataInput.disabled    = false;
    testDataInput.disabled     = false;
    fileDropdown.disabled      = false;
    saveConfigButton.disabled  = false;
    startButton.disabled       = (trainDataset === null);
  }

  // Populate sample dropdown
  for (let i = 0; i < 10; i++) {
    const opt = document.createElement('option');
    opt.value = opt.textContent = `cifar10_client_${i}_test.json`;
    fileDropdown.appendChild(opt);
  }

  // Save config
  saveConfigButton.addEventListener('click', () => {
    config.algos.node_0.topology     = document.getElementById('topology').value;
    config.signaling_server          = document.getElementById('signaling_server').value;
    config.num_users                 = +document.getElementById('num_users').value;
    config.session_id                = document.getElementById('session_id').value;
    config.epochs                    = +document.getElementById('epochs').value;
    config.num_collaborators         = +document.getElementById('num_collaborators').value;

    localStorage.setItem('topology',        config.algos.node_0.topology);
    localStorage.setItem('signalingServer', config.signaling_server);
    localStorage.setItem('numUsers',        config.num_users);
    localStorage.setItem('sessionId',       config.session_id);
    localStorage.setItem('epochs',          config.epochs);
    localStorage.setItem('numCollaborators',config.num_collaborators);

    displayMessage('Config Saved:');
    displayMessage(JSON.stringify(config, null, 2));
    if (trainDataset) startButton.disabled = false;
  });

  // Load training data
  trainDataInput.addEventListener('change', ({ target }) => {
    const file = target.files[0];
    if (!file) return;
    displayMessage(`Loading training file: ${file.name}`);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        trainDataset = processData(JSON.parse(e.target.result));
        displayMessage('Successfully loaded training data');
        enableControls();
        target.value = '';
      } catch (err) {
        displayMessage(`Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  });

  // Load test data
  testDataInput.addEventListener('change', ({ target }) => {
    const file = target.files[0];
    if (!file) return;
    displayMessage(`Loading test file: ${file.name}`);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        testDataset = processData(JSON.parse(e.target.result));
        displayMessage('Successfully loaded test data');
      } catch (err) {
        displayMessage(`Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  });

  // Sample partition select
  fileDropdown.addEventListener('change', async ({ target }) => {
    const filename = target.value;
    if (!filename) return;
    try {
      const res = await fetch(`/datasets/imgs/cifar10_iid/${filename}`);
      const json = await res.json();
      trainDataset = processData(json);
      displayMessage('Successfully loaded sample partition.');
      enableControls();
      target.value = '';
      testDataset = null;
    } catch (err) {
      displayMessage(`Error: ${err.message}`);
    }
  });

  // Split helper
  function splitDataset(dataset, ratio = 0.8) {
    const images = [...dataset.images];
    const labels = [...dataset.labels];
    for (let i = images.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [images[i], images[j]] = [images[j], images[i]];
      [labels[i], labels[j]] = [labels[j], labels[i]];
    }
    const idx = Math.floor(images.length * ratio);
    return {
      trainData: { images: images.slice(0, idx), labels: labels.slice(0, idx) },
      testData : { images: images.slice(idx),    labels: labels.slice(idx) }
    };
  }

  // Start training
  startButton.addEventListener('click', () => {
    disableControls();
    if (!trainDataset) {
      displayMessage('Error: Training data not loaded');
      enableControls();
      return;
    }

    let finalTrain = trainDataset;
    let finalTest  = testDataset;
    if (!testDataset) {
      displayMessage('Splitting training data 80/20...');
      const { trainData, testData } = splitDataset(trainDataset);
      finalTrain = trainData;
      finalTest  = testData;
      displayMessage(`Split: ${finalTrain.images.length} train, ${finalTest.images.length} test`);
    }

    displayMessage(`Starting training (${finalTrain.images.length} train, ${finalTest.images.length} test)`);
    const node = new WebRTCCommUtils(config, finalTrain, finalTest);

    // If node emits progress events, update graph
    if (typeof node.on === 'function') {
      node.on('progress', ({ step, loss }) => {
        if (window.updateTrainingGraph) {
          updateTrainingGraph(step, loss);
        }
      });
    }
  });

  // Pre-fill form from localStorage
  (function prefillForm() {
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) return;
    document.getElementById('session_id').value = sessionId;
    ['topology','signalingServer','numUsers','epochs','numCollaborators'].forEach(key => {
      const val = localStorage.getItem(key);
      if (val !== null) {
        const el = document.getElementById(key === 'topology' ? 'topology' :
                      key === 'signalingServer' ? 'signaling_server' :
                      key === 'numUsers' ? 'num_users' :
                      key === 'epochs'? 'epochs': 'num_collaborators');
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
