import type { Page } from 'puppeteer-core';
import { broadcast } from './ws';

// screencast 参数：质量与尺寸按实时预览需求压低，减少编码和传输开销
const SCREENCAST_QUALITY = 60;
const SCREENCAST_MAX_WIDTH = 840;
const SCREENCAST_MAX_HEIGHT = 1800;
const FRAME_MIN_INTERVAL_MS = 100;

// 启动 CDP screencast，把浏览器画面帧经 WebSocket 推给前端
// 返回停止函数
export async function startScreencast(page: Page) {
    const cdp = await page.createCDPSession();
    let lastFrameAt = 0;

    cdp.on('Page.screencastFrame', (event: { data: string; sessionId: number }) => {
        const now = Date.now();
        if (now - lastFrameAt >= FRAME_MIN_INTERVAL_MS) {
            lastFrameAt = now;
            broadcast({ type: 'frame', data: event.data });
        }
        cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    });

    await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: SCREENCAST_QUALITY,
        maxWidth: SCREENCAST_MAX_WIDTH,
        maxHeight: SCREENCAST_MAX_HEIGHT,
        everyNthFrame: 1,
    });

    return async () => {
        await cdp.send('Page.stopScreencast').catch(() => {});
    };
}
