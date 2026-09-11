export function browserOpenCommand(platform: string, url: string) {
    if (platform === 'darwin') {
        return ['open', url];
    }
    if (platform === 'win32') {
        return ['cmd', '/c', 'start', url];
    }
    return ['xdg-open', url];
}
