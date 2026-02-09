import { WebPCodec } from '@playcanvas/splat-transform';
import { Color, createGraphicsDevice, Vec3 } from 'playcanvas';

import { registerCameraPosesEvents } from './camera-poses';
import { Capturer } from './capturer';
import { registerDocEvents } from './doc';
import { EditHistory } from './edit-history';
import { registerEditorEvents } from './editor';
import { Events } from './events';
import { initFileHandler } from './file-handler';
import { registerIframeApi } from './iframe-api';
import { registerPlySequenceEvents } from './ply-sequence';
import { registerPublishEvents } from './publish';
import { registerRenderEvents } from './render';
import { Scene } from './scene';
import { getSceneConfig } from './scene-config';
import { registerSelectionEvents } from './selection';
import { ShortcutManager } from './shortcut-manager';
// import { registerTimelineEvents } from './timeline';
import { BoxSelection } from './tools/box-selection';
import { BrushSelection } from './tools/brush-selection';
import { EyedropperSelection } from './tools/eyedropper-selection';
import { FloodSelection } from './tools/flood-selection';
import { LassoSelection } from './tools/lasso-selection';
import { MeasureTool } from './tools/measure-tool';
import { MoveTool } from './tools/move-tool';
import { PolygonSelection } from './tools/polygon-selection';
import { RectSelection } from './tools/rect-selection';
import { RotateTool } from './tools/rotate-tool';
import { ScaleTool } from './tools/scale-tool';
import { SphereSelection } from './tools/sphere-selection';
import { ToolManager } from './tools/tool-manager';
import { registerTransformHandlerEvents } from './transform-handler';
import { EditorUI } from './ui/editor';
import { localizeInit } from './ui/localization';

/**
 * Initialize camera position and rotation based on extrinsics and intrinsics
 * @param extrinsics - Optional extrinsics data
 * @param intrinsics - Optional intrinsics data
 */
function calculateCameraConfig(extrinsics?: any, intrinsics?: any) {
    // Default camera position and target
    const defaultPosition = new Vec3(0, 0, 5);
    const defaultTarget = new Vec3(0, 0, 0);

    let returnPosition = defaultPosition;
    let returnTarget = defaultTarget;
    if (extrinsics) {
        try {
            // Use extrinsics to set camera position and target
            const position = new Vec3(
                extrinsics[0][3] || 0,
                extrinsics[1][3] || 0,
                extrinsics[2][3] || 0
            );
            // Calculate target by moving forward from position
            const forward = new Vec3(
                extrinsics[0][2] || 0,
                extrinsics[1][2] || 0,
                extrinsics[2][2] || 0
            );
            const target = new Vec3().add2(position, forward);

            // Set camera pose
            if (window.scene.camera) {
                returnPosition = position;
                returnTarget = target;
            }
        } catch (error) {
            // Use default position and target
            if (window.scene.camera) {
                returnPosition = defaultPosition;
                returnTarget = defaultTarget;
            }
        }
    } else {
        // Use default position and target
        if (window.scene.camera) {
            returnPosition = defaultPosition;
            returnTarget = defaultTarget;
        }
    }
    return { position: returnPosition, target: returnTarget };
}

// 放在檔案開頭或工具函數區
function parseBoolean(value: string) {
    if (value === null || value === undefined) {
        return false; // 預設值，也可以改成 true
    }

    const str = String(value).trim().toLowerCase();

    // 常見的「真」表示方式
    return str === 'true' ||
           str === '1' ||
           str === 'yes' ||
           str === 'y' ||
           str === 'on';
}

declare global {
    interface LaunchParams {
        readonly files: FileSystemFileHandle[];
    }

    interface Window {
        launchQueue: {
            setConsumer: (callback: (launchParams: LaunchParams) => void) => void;
        };
        scene: Scene;
    }
}

const getURLArgs = () => {
    // extract settings from command line in non-prod builds only
    const config = {};

    const apply = (key: string, value: string) => {
        let obj: any = config;
        key.split('.').forEach((k, i, a) => {
            if (i === a.length - 1) {
                obj[k] = value;
            } else {
                if (!obj.hasOwnProperty(k)) {
                    obj[k] = {};
                }
                obj = obj[k];
            }
        });
    };

    const params = new URLSearchParams(window.location.search.slice(1));
    params.forEach((value: string, key: string) => {
        apply(key, value);
    });

    return config;
};

const main = async () => {
    // root events object
    const events = new Events();

    // url
    const url = new URL(window.location.href);

    // edit history
    const editHistory = new EditHistory(events);

    // init localization
    await localizeInit();

    // Configure WebP WASM for SOG format (used for both reading and writing)
    WebPCodec.wasmUrl = new URL('static/lib/webp/webp.wasm', document.baseURI).toString();

    // register events that only need the events object (before UI is created)
    // registerTimelineEvents(events);
    registerCameraPosesEvents(events);
    registerTransformHandlerEvents(events);
    registerPlySequenceEvents(events);
    registerPublishEvents(events);
    registerIframeApi(events);

    // initialize shortcuts
    const shortcutManager = new ShortcutManager(events);
    events.function('shortcutManager', () => shortcutManager);

    // editor ui
    const editorUI = new EditorUI(events);

    // create the graphics device
    const graphicsDevice = await createGraphicsDevice(editorUI.canvas, {
        deviceTypes: ['webgl2'],
        antialias: false,
        depth: false,
        stencil: false,
        xrCompatible: false,
        powerPreference: 'high-performance'
    });

    const overrides = [
        getURLArgs()
    ];

    // resolve scene config
    const sceneConfig = getSceneConfig(overrides);

    // construct the manager
    const scene = new Scene(
        events,
        sceneConfig,
        editorUI.canvas,
        graphicsDevice
    );

    // colors
    const bgClr = new Color();
    const selectedClr = new Color();
    const unselectedClr = new Color();
    const lockedClr = new Color();

    const setClr = (target: Color, value: Color, event: string) => {
        if (!target.equals(value)) {
            target.copy(value);
            events.fire(event, target);
        }
    };

    const setBgClr = (clr: Color) => {
        setClr(bgClr, clr, 'bgClr');
    };
    const setSelectedClr = (clr: Color) => {
        setClr(selectedClr, clr, 'selectedClr');
    };
    const setUnselectedClr = (clr: Color) => {
        setClr(unselectedClr, clr, 'unselectedClr');
    };
    const setLockedClr = (clr: Color) => {
        setClr(lockedClr, clr, 'lockedClr');
    };

    events.on('setBgClr', (clr: Color) => {
        setBgClr(clr);
    });
    events.on('setSelectedClr', (clr: Color) => {
        setSelectedClr(clr);
    });
    events.on('setUnselectedClr', (clr: Color) => {
        setUnselectedClr(clr);
    });
    events.on('setLockedClr', (clr: Color) => {
        setLockedClr(clr);
    });

    events.function('bgClr', () => {
        return bgClr;
    });
    events.function('selectedClr', () => {
        return selectedClr;
    });
    events.function('unselectedClr', () => {
        return unselectedClr;
    });
    events.function('lockedClr', () => {
        return lockedClr;
    });

    events.on('bgClr', (clr: Color) => {
        const cnv = (v: number) => `${Math.max(0, Math.min(255, (v * 255))).toFixed(0)}`;
        document.body.style.backgroundColor = `rgba(${cnv(clr.r)},${cnv(clr.g)},${cnv(clr.b)},1)`;
    });
    events.on('selectedClr', (clr: Color) => {
        scene.forceRender = true;
    });
    events.on('unselectedClr', (clr: Color) => {
        scene.forceRender = true;
    });
    events.on('lockedClr', (clr: Color) => {
        scene.forceRender = true;
    });

    // initialize colors from application config
    const toColor = (value: { r: number, g: number, b: number, a: number }) => {
        return new Color(value.r, value.g, value.b, value.a);
    };
    setBgClr(toColor(sceneConfig.bgClr));
    setSelectedClr(toColor(sceneConfig.selectedClr));
    setUnselectedClr(toColor(sceneConfig.unselectedClr));
    setLockedClr(toColor(sceneConfig.lockedClr));

    // create the mask selection canvas
    const maskCanvas = document.createElement('canvas');
    const maskContext = maskCanvas.getContext('2d');
    maskCanvas.setAttribute('id', 'mask-canvas');
    maskContext.globalCompositeOperation = 'copy';

    const mask = {
        canvas: maskCanvas,
        context: maskContext
    };

    // tool manager
    const toolManager = new ToolManager(events);
    toolManager.register('rectSelection', new RectSelection(events, editorUI.toolsContainer.dom));
    toolManager.register('brushSelection', new BrushSelection(events, editorUI.toolsContainer.dom, mask));
    toolManager.register('floodSelection', new FloodSelection(events, editorUI.toolsContainer.dom, mask, editorUI.canvasContainer));
    toolManager.register('polygonSelection', new PolygonSelection(events, editorUI.toolsContainer.dom, mask));
    toolManager.register('lassoSelection', new LassoSelection(events, editorUI.toolsContainer.dom, mask));
    toolManager.register('sphereSelection', new SphereSelection(events, scene, editorUI.canvasContainer));
    toolManager.register('boxSelection', new BoxSelection(events, scene, editorUI.canvasContainer));
    toolManager.register('eyedropperSelection', new EyedropperSelection(events, editorUI.toolsContainer.dom, editorUI.canvasContainer));
    toolManager.register('move', new MoveTool(events, scene));
    toolManager.register('rotate', new RotateTool(events, scene));
    toolManager.register('scale', new ScaleTool(events, scene));
    toolManager.register('measure', new MeasureTool(events, scene, editorUI.toolsContainer.dom, editorUI.canvasContainer));

    editorUI.toolsContainer.dom.appendChild(maskCanvas);

    window.scene = scene;

    // register events that need scene or other dependencies
    registerEditorEvents(events, editHistory, scene);
    registerSelectionEvents(events, scene);
    registerDocEvents(scene, events);
    registerRenderEvents(scene, events);
    initFileHandler(scene, events, editorUI.appContainer.dom);

    // load async models
    scene.start();

    let capturer: Capturer = null;
    const urlParams = new URLSearchParams(window.location.search);
    const snapshot = parseBoolean(urlParams.get('snapshot'));
    if (snapshot) {
        const widthStr = urlParams.get('width');
        const heightStr = urlParams.get('height');
        const width = parseInt(widthStr, 10);
        const height = parseInt(heightStr, 10);
        capturer = new Capturer(editorUI.canvas, events, scene, width, height);
        events.function('capturer', () => capturer);

        const rawServerUrl = urlParams.get('server');
        if (rawServerUrl) {
            const serverUrl = decodeURIComponent(rawServerUrl);
            const screenShotUrl = `${serverUrl}/screenshot`;
            const windowCloseUrl = `${serverUrl}/window_closed`;
            capturer.onScreenshot = (dataUrl: string) => {
                fetch(screenShotUrl, {
                    method: 'POST',
                    mode: 'cors',               // 显式开启 CORS
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: dataUrl })
                })
                .then((response) => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    console.log('[SnapshotGaussian] Screenshot sent to server');
                })
                .catch((err) => {
                    console.error('[SnapshotGaussian] Failed to send screenshot:', err);
                });

                // Close the window after a short delay
                setTimeout(() => {
                    window.close();
                }, 500);
            };

            window.addEventListener('beforeunload', () => {
                const data = JSON.stringify({ closed: true });
                fetch(windowCloseUrl, {
                    method: 'POST',
                    mode: 'cors',               // 显式开启 CORS
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            });

            // Add instructions text
            const instructions = document.createElement('div');
            instructions.className = 'instructions';
            instructions.innerHTML = 'Press <strong>Enter</strong> to take snapshot and close window';
            instructions.style.position = 'absolute';
            instructions.style.bottom = '40px';
            instructions.style.left = '50%';
            instructions.style.transform = 'translateX(-50%)';
            instructions.style.background = 'rgba(0, 0, 0, 0.7)';
            instructions.style.color = 'white';
            instructions.style.padding = '8px 16px';
            instructions.style.borderRadius = '4px';
            instructions.style.fontSize = '14px';
            instructions.style.zIndex = '100';
            instructions.style.textAlign = 'center';

            const canvasContainer = editorUI.canvas.parentElement;
            if (canvasContainer) {
                canvasContainer.appendChild(instructions);
            } else {
                document.body.appendChild(instructions);
            }

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    // 处理 enter 键按下事件
                    capturer.screenshot();
                }
            });
        }
    }

    {
        const extrinsicsStr = urlParams.get('extrinsics');
        const intrinsicsStr = urlParams.get('intrinsics');
        let extrinsics = null;
        let intrinsics = null;
        try {
            if (extrinsicsStr) extrinsics = JSON.parse(extrinsicsStr);
            if (intrinsicsStr) intrinsics = JSON.parse(intrinsicsStr);
        } catch (e) {
            console.warn('Failed to parse extrinsics/intrinsics:', e);
        }
        const tempConfig = calculateCameraConfig(extrinsics, intrinsics);

        scene.config.controls.resetPosition = tempConfig.position;
        scene.config.controls.resetTarget = tempConfig.target;
        scene.config.controls.resetFlag = true;

        scene.camera.setPose(tempConfig.position, tempConfig.target);
    }

    // handle load params
    const loadList = url.searchParams.getAll('load');
    const filenameList = url.searchParams.getAll('filename');
    for (const [i, value] of loadList.entries()) {
        const decoded = decodeURIComponent(value);
        const filename = i < filenameList.length ?
            decodeURIComponent(filenameList[i]) :
            decoded.split('/').pop();

        await events.invoke('import', [{
            filename,
            url: decoded
        }]);
    }

    // handle OS-based file association in PWA mode
    if ('launchQueue' in window) {
        window.launchQueue.setConsumer(async (launchParams: LaunchParams) => {
            for (const file of launchParams.files) {
                await events.invoke('import', [{
                    filename: file.name,
                    contents: await file.getFile()
                }]);
            }
        });
    }

    const rawServerUrl = urlParams.get('server');
    if (rawServerUrl) {
        const serverUrl = decodeURIComponent(rawServerUrl);
        const apiUrl = `${serverUrl}/api/latest-upload`;

        let hasLoaded = false;

        const poll = async () => {
            if (hasLoaded) return; // 安全兜底

            try {
                const res = await fetch(apiUrl);
                if (!res.ok) throw new Error('HTTP error');

                const data = await res.json();
                if (!data.filename || !data.contents) {
                    // 未就绪，稍后重试
                    setTimeout(poll, 50); // 👈 关键：延迟后再次调用自己
                    return;
                }

                hasLoaded = true;

                const bin = atob(data.contents);
                const arr = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; ++i) arr[i] = bin.charCodeAt(i);
                const blob = new Blob([arr], { type: 'application/octet-stream' });
                const file = new File([blob], data.filename);

                await events.invoke('import', [{ filename: data.filename, contents: file }]);
            } catch (e) {
                setTimeout(poll, 50); // 出错也重试
            }
        };

        poll(); // 启动
    }
};

export { main };
