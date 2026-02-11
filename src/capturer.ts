import { Events } from './events';
import { PngCompressor } from './png-compressor';
import { Scene } from './scene';
import { localize } from './ui/localization';

/**
 * Constants for Capturer class
 */
const CAPTURER_CONSTANTS = {
    // Screenshot area settings
    LABEL_TOP_OFFSET: 32,    // Offset for label position above screenshot area
    EDGE_THRESHOLD: 3,      // Threshold for detecting edge/ corner hover
    MIN_SCREENSHOT_SIZE: 64,  // Minimum size for screenshot area
    DEFAULT_SCREENSHOT_SIZE: 512, // Default size for screenshot area

    // UI element sizes
    BORDER_WIDTH: 2,          // Border width for indicator
    ARROW_SIZE: 4,            // Size of label arrow
    BUTTON_PADDING: 0,        // Padding for reset button
    BUTTON_SIZE: 16,          // Size of reset button
    LABEL_PADDING: '4px 8px', // Padding for label
    LABEL_FONT_SIZE: '11px',  // Font size for label
    LABEL_GAP: 6,             // Gap between label elements
    SVG_ICON_SIZE: 12,        // Size of SVG icons

    // Z-index values
    INDICATOR_Z_INDEX: 40,    // Z-index for screenshot area indicator
    LABEL_Z_INDEX: 50         // Z-index for label (higher than indicator)
};

/**
 * Resize mode enum for screenshot area indicator
 */
enum ResizeMode {
    NONE,
    TOP_LEFT,
    TOP_RIGHT,
    BOTTOM_LEFT,
    BOTTOM_RIGHT,
    LEFT,
    RIGHT,
    TOP,
    BOTTOM
}

enum ModifyMode {
    NORMAL,
    CTRL,
    CTRL_HOVER,
    MODIFYING
}

/**
 * Capturer class for handling screenshot functionality
 * Based on gaussian_node.html screenshot area implementation
 */
class Capturer {
    private canvas: HTMLCanvasElement;
    private events: Events;
    private scene: Scene;
    private screenshotAreaIndicator: HTMLElement;
    private indicatorBorder: HTMLElement;
    private indicatorLabel: HTMLElement;
    private labelText: HTMLElement;
    // private captureButton: HTMLElement; // DISABLED

    private screenshotWidth: number;
    private screenshotHeight: number;
    private isDragging: boolean = false;
    private isResizing: boolean = false;
    private resizeMode: ResizeMode = ResizeMode.NONE;
    private startX: number = 0;
    private startY: number = 0;
    private startWidth: number = 0;
    private startHeight: number = 0;
    private startLeft: number = 0;
    private startTop: number = 0;
    private resetButton: HTMLButtonElement;
    private defaultScreenshotWidth: number;
    private defaultScreenshotHeight: number;
    private defaultLeft: number = 0;
    private defaultTop: number = 0;

    private modifyMode: ModifyMode = ModifyMode.NORMAL;
    private isHovering: boolean = false;
    private isCtrlPressed: boolean = false;
    private mouseX: number = 0;
    private mouseY: number = 0;
    public onScreenshot: ((dataUrl: string) => void) | null = null;
    public onReset: (() => void) | null = null;

    /**
     * Get whether the screenshot area is being modified (dragged or resized)
     * @returns True if the screenshot area is being modified, false otherwise
     */
    public get isModifying() {
        return this.isDragging || this.isResizing;
    }

    constructor(canvas: HTMLCanvasElement, events: Events, scene: Scene, defaultWidth: number = CAPTURER_CONSTANTS.DEFAULT_SCREENSHOT_SIZE, defaultHeight: number = CAPTURER_CONSTANTS.DEFAULT_SCREENSHOT_SIZE) {
        this.canvas = canvas;
        this.events = events;
        this.scene = scene;
        this.defaultScreenshotWidth = defaultWidth;
        this.defaultScreenshotHeight = defaultHeight;
        this.screenshotWidth = defaultWidth;
        this.screenshotHeight = defaultHeight;
        this.onScreenshot = null;

        this.createScreenshotAreaIndicator();
        this.updateScreenshotAreaIndicator();

        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;
        this.defaultLeft = (canvasWidth - this.screenshotWidth) / 2;
        this.defaultTop = (canvasHeight - this.screenshotHeight) / 2;

        this.setupEventListeners();

        // Register events
        events.on('capturer.setScreenshotSize', (width: number, height: number) => {
            this.setScreenshotSize(width, height);
        });

        events.on('capturer.takeScreenshot', () => {
            this.screenshot();
        });
    }

    private updateModifyMode() {
        if (this.isCtrlPressed) {
            if (this.isModifying) {
                this.modifyMode = ModifyMode.MODIFYING;
            } else if (this.isHovering) {
                this.modifyMode = ModifyMode.CTRL_HOVER;
            } else {
                this.modifyMode = ModifyMode.CTRL;
            }
        } else {
            this.modifyMode = ModifyMode.NORMAL;
        }

        switch (this.modifyMode) {
            case ModifyMode.NORMAL:
                this.screenshotAreaIndicator.style.pointerEvents = 'none';
                this.indicatorBorder.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                this.indicatorBorder.style.boxShadow = '0 0 0 2px rgba(0, 122, 255, 0.3)';
                break;
            case ModifyMode.CTRL:
                this.screenshotAreaIndicator.style.pointerEvents = 'auto';
                this.indicatorBorder.style.borderColor = 'rgba(255, 255, 255, 0.55)';
                this.indicatorBorder.style.boxShadow = '0 0 0 2px rgba(0, 122, 255, 0.4)';
                break;
            case ModifyMode.CTRL_HOVER:
                this.screenshotAreaIndicator.style.pointerEvents = 'auto';
                this.indicatorBorder.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                this.indicatorBorder.style.boxShadow = '0 0 0 2px rgba(0, 122, 255, 0.6)';
                break;
            case ModifyMode.MODIFYING:
                this.screenshotAreaIndicator.style.pointerEvents = 'auto';
                this.indicatorBorder.style.borderColor = 'rgba(255, 255, 255, 0.65)';
                this.indicatorBorder.style.boxShadow = '0 0 0 2px rgba(0, 122, 255, 0.8)';
                break;
        }
    }

    /**
     * Create the screenshot area indicator
     */
    private createScreenshotAreaIndicator() {
        // Create indicator container
        this.screenshotAreaIndicator = document.createElement('div');
        this.screenshotAreaIndicator.id = 'screenshotAreaIndicator';
        this.screenshotAreaIndicator.className = 'screenshot-area-indicator';

        // Create border
        this.indicatorBorder = document.createElement('div');
        this.indicatorBorder.className = 'indicator-border';
        this.screenshotAreaIndicator.appendChild(this.indicatorBorder);

        // Create label
        this.indicatorLabel = document.createElement('div');
        this.indicatorLabel.className = 'indicator-label';

        // Create label text
        this.labelText = document.createElement('span');
        this.labelText.className = 'label-text';
        this.indicatorLabel.appendChild(this.labelText);

        // Create reset button
        this.resetButton = document.createElement('button');
        this.resetButton.className = 'reset-button';
        this.resetButton.title = 'Reset screenshot area';

        // Add SVG icon
        this.resetButton.innerHTML = `
            <svg width="${CAPTURER_CONSTANTS.SVG_ICON_SIZE}" height="${CAPTURER_CONSTANTS.SVG_ICON_SIZE}" viewBox="0 0 ${CAPTURER_CONSTANTS.SVG_ICON_SIZE} ${CAPTURER_CONSTANTS.SVG_ICON_SIZE}" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 1L7.5 3.5H9.5V5.5H7.5V3.5L6 1Z" fill="white"/>
                <path d="M6 11L4.5 8.5H2.5V6.5H4.5V8.5L6 11Z" fill="white"/>
                <path d="M1 6L3.5 4.5V2.5H5.5V4.5H3.5L1 6Z" fill="white"/>
                <path d="M11 6L8.5 7.5V9.5H6.5V7.5H8.5L11 6Z" fill="white"/>
            </svg>
        `;

        // Add reset button to label
        this.indicatorLabel.appendChild(this.resetButton);

        // Create capture button - DISABLED
        /*
        this.captureButton = document.createElement('button');
        this.captureButton.className = 'capture-button';
        this.captureButton.textContent = 'CAPTURE';

        // Add mousedown event listener to take screenshot and close
        this.captureButton.addEventListener('mousedown', () => {
            this.screenshot();
        });

        // Add hover and active styles
        this.captureButton.addEventListener('mouseenter', () => {
            this.captureButton.style.background = 'rgba(0, 122, 255, 1)';
        });

        this.captureButton.addEventListener('mouseleave', () => {
            this.captureButton.style.background = 'rgba(0, 122, 255, 0.8)';
        });

        this.captureButton.addEventListener('mousedown', () => {
            this.captureButton.style.background = 'rgba(0, 90, 180, 1)';
        });
        */

        // Add reset button styles
        this.resetButton.style.background = 'rgba(255, 255, 255, 0.2)';
        this.resetButton.style.border = 'none';
        this.resetButton.style.borderRadius = '2px';
        this.resetButton.style.padding = `${CAPTURER_CONSTANTS.BUTTON_PADDING}px`;
        this.resetButton.style.cursor = 'pointer';
        this.resetButton.style.display = 'flex';
        this.resetButton.style.alignItems = 'center';
        this.resetButton.style.justifyContent = 'center';
        this.resetButton.style.transition = 'background 0.2s';
        this.resetButton.style.pointerEvents = 'auto';
        this.resetButton.style.position = 'relative';
        this.resetButton.style.zIndex = '1000';
        this.resetButton.style.width = `${CAPTURER_CONSTANTS.BUTTON_SIZE}px`;
        this.resetButton.style.height = `${CAPTURER_CONSTANTS.BUTTON_SIZE}px`;


        // Add hover and active styles
        this.resetButton.addEventListener('mouseenter', () => {
            this.resetButton.style.background = 'rgba(255, 255, 255, 0.3)';
        });

        this.resetButton.addEventListener('mouseleave', () => {
            this.resetButton.style.background = 'rgba(255, 255, 255, 0.2)';
        });

        this.resetButton.addEventListener('mousedown', () => {
            this.resetButton.style.background = 'rgba(255, 255, 255, 0.4)';
        });

        this.resetButton.addEventListener('mouseup', () => {
            this.resetButton.style.background = 'rgba(255, 255, 255, 0.3)';
        });

        // Add reset button click event
        this.resetButton.addEventListener('pointerdown', (e) => {
            this.resetScreenshotArea();
            e.preventDefault();
            e.stopPropagation();
        });

        // Initial update of reset button visibility
        this.updateResetButtonVisibility();

        // Add to canvas container
        const canvasContainer = this.canvas.parentElement;
        if (canvasContainer) {
            canvasContainer.appendChild(this.screenshotAreaIndicator);

            // Add label as a separate element to canvas container
            canvasContainer.appendChild(this.indicatorLabel);

            // Add instructions element to canvas container - DISABLED
            /*
            canvasContainer.appendChild(this.captureButton);
            */
        } else {
            // Fallback: append to document body
            document.body.appendChild(this.screenshotAreaIndicator);

            // Add label as a separate element to document body
            document.body.appendChild(this.indicatorLabel);

            // Add instructions element to document body - DISABLED
            /*
            document.body.appendChild(this.captureButton);
            */
        }

        // Set basic styles
        this.screenshotAreaIndicator.style.position = 'absolute';
        this.screenshotAreaIndicator.style.zIndex = `${CAPTURER_CONSTANTS.INDICATOR_Z_INDEX}`;
        this.screenshotAreaIndicator.style.pointerEvents = 'auto';
        this.screenshotAreaIndicator.style.width = `${this.screenshotWidth}px`;
        this.screenshotAreaIndicator.style.height = `${this.screenshotHeight}px`;

        // Set border styles
        this.indicatorBorder.style.border = `${CAPTURER_CONSTANTS.BORDER_WIDTH}px solid rgba(255, 255, 255, 0.5)`;
        this.indicatorBorder.style.boxShadow = `0 0 0 ${CAPTURER_CONSTANTS.BORDER_WIDTH}px rgba(0, 122, 255, 0.3)`;
        this.indicatorBorder.style.position = 'relative';

        // Set label styles
        this.indicatorLabel.style.position = 'absolute';
        this.indicatorLabel.style.top = `-${CAPTURER_CONSTANTS.LABEL_TOP_OFFSET}px`; // Position above the screenshot area
        this.indicatorLabel.style.left = '50%';
        this.indicatorLabel.style.transform = 'translateX(-50%)';
        this.indicatorLabel.style.background = 'rgba(0, 122, 255, 0.8)';
        this.indicatorLabel.style.color = 'white';
        this.indicatorLabel.style.padding = CAPTURER_CONSTANTS.LABEL_PADDING;
        this.indicatorLabel.style.borderRadius = '4px';
        this.indicatorLabel.style.fontSize = CAPTURER_CONSTANTS.LABEL_FONT_SIZE;
        this.indicatorLabel.style.whiteSpace = 'nowrap';
        this.indicatorLabel.style.display = 'flex';
        this.indicatorLabel.style.alignItems = 'center';
        this.indicatorLabel.style.gap = `${CAPTURER_CONSTANTS.LABEL_GAP}px`;
        this.indicatorLabel.style.zIndex = `${CAPTURER_CONSTANTS.LABEL_Z_INDEX}`;
        this.indicatorLabel.style.height = `${CAPTURER_CONSTANTS.BUTTON_SIZE}px`;
        this.indicatorLabel.style.pointerEvents = 'none';

        // Set capture button styles - DISABLED
        /*
        this.captureButton.style.position = 'absolute';
        this.captureButton.style.background = 'rgba(0, 122, 255, 0.8)';
        this.captureButton.style.color = 'white';
        this.captureButton.style.padding = '8px 16px';
        this.captureButton.style.border = 'none';
        this.captureButton.style.borderRadius = '4px';
        this.captureButton.style.fontSize = '12px';
        this.captureButton.style.fontWeight = 'bold';
        this.captureButton.style.whiteSpace = 'nowrap';
        this.captureButton.style.textAlign = 'center';
        this.captureButton.style.cursor = 'pointer';
        this.captureButton.style.left = '50%';
        this.captureButton.style.bottom = '50px';
        this.captureButton.style.transform = 'translateX(-50%)';
        this.captureButton.style.transition = 'background 0.2s';
        this.captureButton.style.pointerEvents = 'auto';
        this.captureButton.style.zIndex = `${CAPTURER_CONSTANTS.LABEL_Z_INDEX}`;
        */

        // Create arrow element
        const arrow = document.createElement('div');
        arrow.style.position = 'absolute';
        arrow.style.top = '100%';
        arrow.style.left = '50%';
        arrow.style.transform = 'translateX(-50%)';
        arrow.style.border = `${CAPTURER_CONSTANTS.ARROW_SIZE}px solid transparent`;
        arrow.style.borderTopColor = 'rgba(0, 122, 255, 0.8)';
        arrow.style.pointerEvents = 'none';
        arrow.style.marginTop = '0px'; // Adjust to align with label
        this.indicatorLabel.appendChild(arrow);
    }

    /**
     * Set up event listeners
     */
    private setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => {
            this.updateScreenshotAreaIndicator();
        });

        // 监听 Ctrl 键按下
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Control') {
                this.isCtrlPressed = true;
                this.updateModifyMode();
                this.updateCursor();
                this.updateResetButtonVisibility();
            }
        });

        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });

        // 监听 Ctrl 键松开
        window.addEventListener('keyup', (e) => {
            if (e.key === 'Control') {
                this.isCtrlPressed = false;
                this.updateModifyMode();
                this.updateCursor();
                this.updateResetButtonVisibility();
            }
        });

        // Notify server when window is closed
        window.addEventListener('beforeunload', () => {
            try {
                const data = JSON.stringify({ closed: true });
                const blob = new Blob([data], { type: 'application/json' });
                navigator.sendBeacon('/window_closed', blob);
                console.log('[SuperSplat] Sent beacon: window closing');
            } catch (error) {
                console.error('[SuperSplat] Error sending beacon:', error);
            }
        });

        this.screenshotAreaIndicator.addEventListener('pointerenter', (e) => {
            this.isHovering = true;
            this.updateModifyMode();
            this.updateCursor();
        });

        this.screenshotAreaIndicator.addEventListener('pointermove', (e) => {
            this.isHovering = true;
            this.updateModifyMode();
            this.updateCursor();
        });

        // Reset cursor when leaving indicator
        this.screenshotAreaIndicator.addEventListener('pointerleave', () => {
            this.isHovering = false;
            this.updateModifyMode();
        });

        // Start dragging or resizing
        this.screenshotAreaIndicator.addEventListener('mousedown', (e) => {
            if (this.resizeMode) {
                this.isResizing = true;
            } else {
                this.isDragging = true;
            }
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.startWidth = this.screenshotWidth;
            this.startHeight = this.screenshotHeight;

            // Get current position relative to canvas
            const rect = this.screenshotAreaIndicator.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            this.startLeft = rect.left - canvasRect.left;
            this.startTop = rect.top - canvasRect.top;


            // Make the indicator brighter when dragging/resizing
            if (this.indicatorBorder) {
                this.indicatorBorder.style.borderColor = 'rgba(255, 255, 255, 0.8)';
                this.indicatorBorder.style.boxShadow = '0 0 0 2px rgba(0, 122, 255, 0.6)';
            }

            // Prevent default behavior
            e.preventDefault();
            e.stopPropagation();
        });

        // Drag or resize movement
        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                // Calculate delta
                const deltaX = e.clientX - this.startX;
                const deltaY = e.clientY - this.startY;

                // Calculate new position
                const newLeft = this.startLeft + deltaX;
                const newTop = this.startTop + deltaY;

                // Ensure the indicator stays within bounds
                const canvasWidth = this.canvas.clientWidth;
                const canvasHeight = this.canvas.clientHeight;
                const boundedLeft = Math.max(0, Math.min(canvasWidth - this.screenshotWidth, newLeft));
                const boundedTop = Math.max(0, Math.min(canvasHeight - this.screenshotHeight, newTop));

                // Update the indicator position
                this.screenshotAreaIndicator.style.left = `${boundedLeft}px`;
                this.screenshotAreaIndicator.style.top = `${boundedTop}px`;

                // Update label position
                if (this.indicatorLabel) {
                    const labelLeft = boundedLeft + (this.screenshotWidth / 2);
                    const labelTop = boundedTop - CAPTURER_CONSTANTS.LABEL_TOP_OFFSET; // Position above the screenshot area

                    this.indicatorLabel.style.left = `${labelLeft}px`;
                    this.indicatorLabel.style.top = `${labelTop}px`;
                }

                // Update reset button visibility during drag
                this.updateResetButtonVisibility();

                // Prevent default behavior
                e.preventDefault();
                e.stopPropagation();
            } else if (this.isResizing) {
                // Calculate delta
                const deltaX = e.clientX - this.startX;
                const deltaY = e.clientY - this.startY;

                // Calculate new size and position
                let newWidth = this.startWidth;
                let newHeight = this.startHeight;
                let newLeft = this.startLeft;
                let newTop = this.startTop;

                // Get canvas dimensions for bounds checking
                const canvasWidth = this.canvas.clientWidth;
                const canvasHeight = this.canvas.clientHeight;

                // Handle different resize modes
                switch (this.resizeMode) {
                    case ResizeMode.TOP_LEFT:
                        // Top-left corner - adjust width, height, and position
                        newWidth = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasWidth, this.startWidth - deltaX));
                        newHeight = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasHeight, this.startHeight - deltaY));
                        newLeft = this.startLeft + (this.startWidth - newWidth);
                        newTop = this.startTop + (this.startHeight - newHeight);
                        break;
                    case ResizeMode.TOP_RIGHT:
                        // Top-right corner - adjust width, height, and position
                        newWidth = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasWidth, this.startWidth + deltaX));
                        newHeight = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasHeight, this.startHeight - deltaY));
                        newTop = this.startTop + (this.startHeight - newHeight);
                        break;
                    case ResizeMode.BOTTOM_LEFT:
                        // Bottom-left corner - adjust width, height, and position
                        newWidth = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasWidth, this.startWidth - deltaX));
                        newHeight = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasHeight, this.startHeight + deltaY));
                        newLeft = this.startLeft + (this.startWidth - newWidth);
                        break;
                    case ResizeMode.BOTTOM_RIGHT:
                        // Bottom-right corner - adjust width and height
                        newWidth = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasWidth, this.startWidth + deltaX));
                        newHeight = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasHeight, this.startHeight + deltaY));
                        break;
                    case ResizeMode.LEFT:
                        // Left edge - adjust width and position
                        newWidth = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasWidth, this.startWidth - deltaX));
                        newLeft = this.startLeft + (this.startWidth - newWidth);
                        newHeight = this.startHeight;
                        break;
                    case ResizeMode.RIGHT:
                        // Right edge - adjust width
                        newWidth = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasWidth, this.startWidth + deltaX));
                        newHeight = this.startHeight;
                        break;
                    case ResizeMode.TOP:
                        // Top edge - adjust height and position
                        newHeight = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasHeight, this.startHeight - deltaY));
                        newTop = this.startTop + (this.startHeight - newHeight);
                        newWidth = this.startWidth;
                        break;
                    case ResizeMode.BOTTOM:
                        // Bottom edge - adjust height
                        newHeight = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, Math.min(canvasHeight, this.startHeight + deltaY));
                        newWidth = this.startWidth;
                        break;
                }

                // Ensure the indicator stays within bounds
                newLeft = Math.max(0, newLeft);
                newTop = Math.max(0, newTop);
                newWidth = Math.min(canvasWidth - newLeft, newWidth);
                newHeight = Math.min(canvasHeight - newTop, newHeight);
                newWidth = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, newWidth);
                newHeight = Math.max(CAPTURER_CONSTANTS.MIN_SCREENSHOT_SIZE, newHeight);

                // Update screenshot dimensions
                this.screenshotWidth = newWidth;
                this.screenshotHeight = newHeight;

                // Update indicator position and size
                this.screenshotAreaIndicator.style.left = `${newLeft}px`;
                this.screenshotAreaIndicator.style.top = `${newTop}px`;
                this.screenshotAreaIndicator.style.width = `${newWidth}px`;
                this.screenshotAreaIndicator.style.height = `${newHeight}px`;

                // Update border size
                if (this.indicatorBorder) {
                    this.indicatorBorder.style.width = `${newWidth}px`;
                    this.indicatorBorder.style.height = `${newHeight}px`;
                }

                // Update label text
                if (this.labelText) {
                    this.labelText.textContent = `${this.screenshotWidth} x ${this.screenshotHeight}`;
                }

                // Update label position
                if (this.indicatorLabel) {
                    const labelLeft = newLeft + (this.screenshotWidth / 2);
                    const labelTop = newTop - CAPTURER_CONSTANTS.LABEL_TOP_OFFSET; // Position above the screenshot area

                    this.indicatorLabel.style.left = `${labelLeft}px`;
                    this.indicatorLabel.style.top = `${labelTop}px`;
                }

                // Update reset button visibility during resize
                this.updateResetButtonVisibility();

                // Prevent default behavior
                e.preventDefault();
                e.stopPropagation();
            }
        });

        // End dragging or resizing
        window.addEventListener('mouseup', (e) => {
            if (this.isDragging || this.isResizing) {
                // Restore the indicator's normal brightness
                if (this.indicatorBorder) {
                    this.indicatorBorder.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                    this.indicatorBorder.style.boxShadow = '0 0 0 2px rgba(0, 122, 255, 0.3)';
                }

                // Reset state
                this.isDragging = false;
                this.isResizing = false;
                this.resizeMode = ResizeMode.NONE;

                // Update reset button visibility
                this.updateResetButtonVisibility();
            }
        });


    }

    /**
     * Update cursor based on mouse position
     */
    private updateCursor() {
        if (this.isModifying) {
            return;
        }
        if (!this.isCtrlPressed) {
            this.screenshotAreaIndicator.style.cursor = 'pointer';
            this.resizeMode = ResizeMode.NONE;
            return;
        }
        const rect = this.screenshotAreaIndicator.getBoundingClientRect();

        const edgeThreshold = CAPTURER_CONSTANTS.EDGE_THRESHOLD;
        const isNearLeft = this.mouseX < rect.left + edgeThreshold;
        const isNearRight = this.mouseX > rect.right - edgeThreshold;
        const isNearTop = this.mouseY < rect.top + edgeThreshold;
        const isNearBottom = this.mouseY > rect.bottom - edgeThreshold;

        if (isNearLeft && isNearTop) {
            // Top-left corner
            this.screenshotAreaIndicator.style.cursor = 'nwse-resize';
            this.resizeMode = ResizeMode.TOP_LEFT;
        } else if (isNearRight && isNearTop) {
            // Top-right corner
            this.screenshotAreaIndicator.style.cursor = 'nesw-resize';
            this.resizeMode = ResizeMode.TOP_RIGHT;
        } else if (isNearLeft && isNearBottom) {
            // Bottom-left corner
            this.screenshotAreaIndicator.style.cursor = 'nesw-resize';
            this.resizeMode = ResizeMode.BOTTOM_LEFT;
        } else if (isNearRight && isNearBottom) {
            // Bottom-right corner
            this.screenshotAreaIndicator.style.cursor = 'nwse-resize';
            this.resizeMode = ResizeMode.BOTTOM_RIGHT;
        } else if (isNearLeft) {
            // Left edge
            this.screenshotAreaIndicator.style.cursor = 'ew-resize';
            this.resizeMode = ResizeMode.LEFT;
        } else if (isNearRight) {
            // Right edge
            this.screenshotAreaIndicator.style.cursor = 'ew-resize';
            this.resizeMode = ResizeMode.RIGHT;
        } else if (isNearTop) {
            // Top edge
            this.screenshotAreaIndicator.style.cursor = 'ns-resize';
            this.resizeMode = ResizeMode.TOP;
        } else if (isNearBottom) {
            // Bottom edge
            this.screenshotAreaIndicator.style.cursor = 'ns-resize';
            this.resizeMode = ResizeMode.BOTTOM;
        } else {
            // Center
            this.screenshotAreaIndicator.style.cursor = 'move';
            this.resizeMode = ResizeMode.NONE;
        }
    }

    /**
     * Update the screenshot area indicator position and size
     */
    private updateScreenshotAreaIndicator() {
        if (!this.screenshotAreaIndicator) return;
        // Calculate the position: center of the canvas
        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;
        const left = (canvasWidth - this.screenshotWidth) / 2;
        const top = (canvasHeight - this.screenshotHeight) / 2;
        // Update default position if using default size
        if (this.screenshotWidth === this.defaultScreenshotWidth &&
            this.screenshotHeight === this.defaultScreenshotHeight) {
            this.defaultLeft = left;
            this.defaultTop = top;
        }
        // Update indicator position and size
        this.screenshotAreaIndicator.style.left = `${left}px`;
        this.screenshotAreaIndicator.style.top = `${top}px`;
        this.screenshotAreaIndicator.style.width = `${this.screenshotWidth}px`;
        this.screenshotAreaIndicator.style.height = `${this.screenshotHeight}px`;
        // Update border size
        if (this.indicatorBorder) {
            this.indicatorBorder.style.width = `${this.screenshotWidth}px`;
            this.indicatorBorder.style.height = `${this.screenshotHeight}px`;
        }
        // Update label text
        if (this.labelText) {
            this.labelText.textContent = `${this.screenshotWidth} x ${this.screenshotHeight}`;
        }
        // Update label position
        if (this.indicatorLabel) {
            const labelLeft = left + (this.screenshotWidth / 2);
            const labelTop = top - CAPTURER_CONSTANTS.LABEL_TOP_OFFSET; // Position above the screenshot area
            this.indicatorLabel.style.position = 'absolute';
            this.indicatorLabel.style.left = `${labelLeft}px`;
            this.indicatorLabel.style.top = `${labelTop}px`;
            this.indicatorLabel.style.transform = 'translateX(-50%)';
            this.indicatorLabel.style.zIndex = '50'; // Higher than the screenshot area
        }
    }

    /**
     * Reset screenshot area to default size and position
     */
    private resetScreenshotArea() {
        // Reset to default size
        this.screenshotWidth = this.defaultScreenshotWidth;
        this.screenshotHeight = this.defaultScreenshotHeight;
        // Force update of default position and indicator
        this.updateScreenshotAreaIndicator();
        // Ensure default position is updated
        if (this.screenshotAreaIndicator) {
            const canvasWidth = this.canvas.clientWidth;
            const canvasHeight = this.canvas.clientHeight;
            this.defaultLeft = (canvasWidth - this.screenshotWidth) / 2;
            this.defaultTop = (canvasHeight - this.screenshotHeight) / 2;
        }
        // Update reset button visibility
        this.updateResetButtonVisibility();
        if (this.onReset) {
            this.onReset();
        }
    }

    /**
     * Update reset button visibility based on conditions
     * Button is visible if:
     * 1. screenshotWidth != defaultScreenshotWidth, OR
     * 2. screenshotHeight != defaultScreenshotHeight, OR
     * 3. current position != default position
     */
    private updateResetButtonVisibility() {
        if (this.resetButton && this.screenshotAreaIndicator) {
            // Get current position
            const currentLeft = parseFloat(this.screenshotAreaIndicator.style.left || '0');
            const currentTop = parseFloat(this.screenshotAreaIndicator.style.top || '0');
            // Check if position or size has changed
            const shouldShow = this.screenshotWidth !== this.defaultScreenshotWidth ||
                              this.screenshotHeight !== this.defaultScreenshotHeight ||
                              Math.abs(currentLeft - this.defaultLeft) > 1 || // Allow small floating point differences
                              Math.abs(currentTop - this.defaultTop) > 1;
            this.resetButton.style.display = shouldShow && this.isCtrlPressed ? 'flex' : 'none';
        }
    }

    /**
     * Set screenshot size
     * @param width - Screenshot width
     * @param height - Screenshot height
     */
    public setScreenshotSize(width: number, height: number) {
        this.screenshotWidth = width;
        this.screenshotHeight = height;
        this.updateScreenshotAreaIndicator();
        this.updateResetButtonVisibility();
    }

    /**
     * Take screenshot and close window (for Gaussian node)
     */
    public async screenshot() {
        try {
            const bgColor = this.events.invoke('bgClr');
            const width = this.canvas.width;
            const height = this.canvas.height;

            // Get the actual position of the screenshot area indicator
            const rect = this.screenshotAreaIndicator.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();

            // Calculate the region to capture based on the indicator's actual position
            const sourceX = rect.left - canvasRect.left;
            const sourceY = rect.top - canvasRect.top;

            // Ensure the source region is within bounds
            const safeSourceX = Math.max(0, sourceX);
            const safeSourceY = Math.max(0, sourceY);
            const safeWidth = Math.min(this.screenshotWidth, this.canvas.width - safeSourceX);
            const safeHeight = Math.min(this.screenshotHeight, this.canvas.height - safeSourceY);

            // start rendering to offscreen buffer only
            this.scene.camera.startOffscreenMode(width, height);
            this.scene.camera.renderOverlays = false;
            this.scene.gizmoLayer.enabled = false;
            const transparentBg = false;
            if (!transparentBg) {
                this.scene.camera.clearPass.setClearColor(bgColor);
            }

            // render the next frame
            this.scene.forceRender = true;

            // for render to finish
            // await postRender();

            // cpu-side buffer to read pixels into
            const data = new Uint8Array(safeWidth * safeHeight * 4);

            const { mainTarget, workTarget } = this.scene.camera;

            this.scene.dataProcessor.copyRt(mainTarget, workTarget);

            // read the rendered frame
            await workTarget.colorBuffer.read(safeSourceX, safeSourceY, safeWidth, safeHeight, { renderTarget: workTarget, data });

            // construct the png compressor

            // 去掉 Alpha 通道，使用白色背景替换透明像素
            const rgbData = new Uint8Array(safeWidth * safeHeight * 3);
            let src = 0, dst = 0;

            // 背景颜色（白色）
            const bgR = bgColor.r * 255;
            const bgG = bgColor.g * 255;
            const bgB = bgColor.b * 255;

            while (src < data.length) {
                // data 格式为 RGBA
                const r = data[src++];
                const g = data[src++];
                const b = data[src++];
                const a = data[src++];

                // Alpha 混合：将透明像素替换为背景颜色
                if (a === 0) {
                    // 完全透明，使用背景颜色
                    rgbData[dst++] = bgR;
                    rgbData[dst++] = bgG;
                    rgbData[dst++] = bgB;
                } else if (a === 255) {
                    // 完全不透明，使用原始颜色
                    rgbData[dst++] = r;
                    rgbData[dst++] = g;
                    rgbData[dst++] = b;
                } else {
                    // 半透明，使用 Alpha 混合公式
                    const alpha = a / 255;
                    const invAlpha = 1 - alpha;
                    rgbData[dst++] = Math.round(r * alpha + bgR * invAlpha);
                    rgbData[dst++] = Math.round(g * alpha + bgG * invAlpha);
                    rgbData[dst++] = Math.round(b * alpha + bgB * invAlpha);
                }
            }

            const compressor = new PngCompressor();

            const arrayBuffer = await compressor.compress(
                new Uint32Array(data.buffer),
                safeWidth,
                safeHeight
            );

            function arrayBufferToBase64(buffer : ArrayBuffer) {
                let binary = '';
                const bytes = new Uint8Array(buffer);
                for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                return window.btoa(binary); // 如果是在浏览器环境中
            }

            const dataUrl = `data:image/png;base64,${arrayBufferToBase64(arrayBuffer)}`;

            if (this.onScreenshot) {
                this.onScreenshot(dataUrl);
            }
        } catch (error) {
            await this.events.invoke('showPopup', {
                type: 'error',
                header: localize('render.failed'),
                message: `'${error.message ?? error}'`
            });
        }
        /*
        try {
            // Create a temporary canvas with the specified size (for capturing only the screenshot area)
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.screenshotWidth;
            tempCanvas.height = this.screenshotHeight;
            const tempCtx = tempCanvas.getContext('2d');

            // Get the actual position of the screenshot area indicator
            const rect = this.screenshotAreaIndicator.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();

            // Calculate the region to capture based on the indicator's actual position
            const sourceX = rect.left - canvasRect.left;
            const sourceY = rect.top - canvasRect.top;

            // Ensure the source region is within bounds
            const safeSourceX = Math.max(0, sourceX);
            const safeSourceY = Math.max(0, sourceY);
            const safeWidth = Math.min(this.screenshotWidth, this.canvas.width - safeSourceX);
            const safeHeight = Math.min(this.screenshotHeight, this.canvas.height - safeSourceY);

            // Draw only the specified region of the original canvas to the temporary canvas
            tempCtx.drawImage(
                this.scene.canvas,
                safeSourceX,
                safeSourceY,
                safeWidth,
                safeHeight,
                0,
                0,
                safeWidth,
                safeHeight
            );

            // Get the data URL from the temporary canvas
            const dataUrl = tempCanvas.toDataURL('image/png');
            console.log('[SnapshotGaussian] Screenshot captured, sending to parent');
            console.log('[SnapshotGaussian] Captured region:', safeWidth, 'x', safeHeight, 'from position:', safeSourceX, safeSourceY);
            // 调用回调并传入 dataUrl
            if (this.onScreenshot) {
                this.onScreenshot(dataUrl);
            }
        } catch (err) {
            console.error('[SnapshotGaussian] Screenshot error:', err);
        }
        */
    }

    /**
     * Get current screenshot size
     * @returns Object with width and height
     */
    public getScreenshotSize() {
        return {
            width: this.screenshotWidth,
            height: this.screenshotHeight
        };
    }
}


export { Capturer };
