export function formatBytes(b) {
    const units = ["B","KB","MB","GB","TB"]
    let i = 0
    while (b >= 1024 && i < units.length-1) {
        b /= 1024
        i++
    }
    return b.toFixed(1) + " " + units[i]
}

export function formatUptime(sec) {
    const d = Math.floor(sec/86400)
    const h = Math.floor((sec%86400)/3600)
    return `${d}d ${h}h`
}

export function escapeHTML(str) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, m => map[m]);
}