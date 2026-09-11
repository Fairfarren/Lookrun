export const CRAP_THRESHOLD = 8;

export function clampCoverage(cov: number) {
    if (cov < 0) {
        return 0;
    }
    if (cov > 1) {
        return 1;
    }
    return cov;
}

export function calculateCrap(cc: number, cov: number) {
    const gap = 1 - clampCoverage(cov);
    return cc * cc * gap * gap * gap + cc;
}

export function passesCrap(cc: number, cov: number) {
    return calculateCrap(cc, cov) <= CRAP_THRESHOLD;
}
