const fs = require('fs');
const path = require('path');

const replacements = {
    'bg-[#020617]': 'bg-slate-50 dark:bg-[#020617]',
    'bg-slate-950': 'bg-slate-100 dark:bg-slate-950',
    'bg-slate-900': 'bg-slate-200 dark:bg-slate-900',
    'bg-slate-800': 'bg-slate-300 dark:bg-slate-800',
    'bg-slate-950/80': 'bg-slate-100/80 dark:bg-slate-950/80',
    'bg-slate-950/60': 'bg-slate-100/60 dark:bg-slate-950/60',
    'bg-slate-950/40': 'bg-slate-100/40 dark:bg-slate-950/40',
    
    'text-slate-400': 'text-slate-500 dark:text-slate-400',
    'text-slate-300': 'text-slate-600 dark:text-slate-300',
    'text-slate-200': 'text-slate-700 dark:text-slate-200',
    'text-slate-100': 'text-slate-800 dark:text-slate-100',
    'text-white': 'text-slate-900 dark:text-white',
    
    'border-slate-800': 'border-slate-200 dark:border-slate-800',
    'border-slate-700': 'border-slate-300 dark:border-slate-700',
    'border-white/10': 'border-black/10 dark:border-white/10',
    'border-white/20': 'border-black/20 dark:border-white/20',
    'border-white/5': 'border-black/5 dark:border-white/5',
    
    'bg-white/5': 'bg-black/5 dark:bg-white/5',
    'bg-white/10': 'bg-black/10 dark:bg-white/10',
    
    'hover:bg-white/10': 'hover:bg-black/10 dark:hover:bg-white/10',
    'hover:bg-white/20': 'hover:bg-black/20 dark:hover:bg-white/20',
    'hover:bg-slate-800': 'hover:bg-slate-200 dark:hover:bg-slate-800',
    'hover:bg-slate-700': 'hover:bg-slate-300 dark:hover:bg-slate-700',
    
    'hover:text-white': 'hover:text-slate-900 dark:hover:text-white',
    'hover:text-slate-100': 'hover:text-slate-800 dark:hover:text-slate-100',
    
    'bg-black/60': 'bg-white/60 dark:bg-black/60',
    
    'text-cyan-400': 'text-cyan-600 dark:text-cyan-400',
    'text-cyan-300': 'text-cyan-700 dark:text-cyan-300'
};

function walkSync(dir, callback) {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
        var filepath = path.join(dir, file);
        const stats = fs.statSync(filepath);
        if (stats.isDirectory()) {
            walkSync(filepath, callback);
        } else if (stats.isFile() && filepath.endsWith('.tsx')) {
            callback(filepath);
        }
    });
}

walkSync('./src', (filepath) => {
    let content = fs.readFileSync(filepath, 'utf8');
    let original = content;
    
    // Sort replacements by length descending to avoid partial matches
    const keys = Object.keys(replacements).sort((a, b) => b.length - a.length);
    
    keys.forEach(key => {
        // We only want to replace whole classes. We can use a regex with word boundaries,
        // but since some classes contain brackets or slashes, we need to be careful.
        // A simple way is to match the class surrounded by whitespace, quotes, or backticks.
        // Regex: /(?<=['"\s`])bg-slate-900(?=['"\s`])/g
        
        const escapedKey = key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const regex = new RegExp(`(?<=['"\\s\`:])${escapedKey}(?=['"\\s\`])`, 'g');
        content = content.replace(regex, replacements[key]);
    });

    if (original !== content) {
        fs.writeFileSync(filepath, content);
        console.log(`Updated ${filepath}`);
    }
});
