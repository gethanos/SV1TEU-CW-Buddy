// Declare UA detection booleans
var isFacebookApp = /FBAV/.test(navigator.userAgent);
var isInstagramApp = /Instagram/.test(navigator.userAgent);
var isInAppBrowser = isFacebookApp || isInstagramApp;

// Function to set help message in overlay
function setHelpMessage() {
    var helpMessage = 'Please open this application in Chrome, Safari, or Firefox for better performance.';
    overlay.textContent = helpMessage;
    statusEl.textContent = helpMessage;
    statusEl.style.color = 'red';
}

// Update the startBtn click handler
startBtn.addEventListener('click', function() {
    if (!running && isInAppBrowser) {
        setHelpMessage();
        return;
    }
    statusEl.textContent = 'Requesting microphone…';
    // existing logic to start the decoder...
    await detector.start();
});

// Existing decoder logic unchanged...