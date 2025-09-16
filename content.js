let isSavingMode = false;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// Create the floating save icon
const saveIcon = document.createElement('div');
saveIcon.textContent = '💾';
saveIcon.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    font-size: 2em;
    cursor: grab;
    z-index: 1000;
    background: white;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 10px rgba(0,0,0,0.2);
`;
document.body.appendChild(saveIcon);

// Add CSS for highlighting posts