const parts = [
  "**Title**\n\nSome **bold text**."
];

for (let i = parts.length - 1; i >= 0; i--) {
  let text = parts[i];
  let cleanText = "";
  let boldRanges = [];
  let cursor = 0;
  let match;
  const regex = /\*\*(.*?)\*\*/g;
  while ((match = regex.exec(text)) !== null) {
    cleanText += text.slice(cursor, match.index);
    const startBold = cleanText.length;
    cleanText += match[1];
    const endBold = cleanText.length;
    boldRanges.push({ startIndex: startBold, endIndex: endBold });
    cursor = match.index + match[0].length;
  }
  cleanText += text.slice(cursor);
  
  const titleLen = cleanText.indexOf('\n');
  
  console.log("cleanText:", cleanText);
  console.log("titleLen:", titleLen);
  console.log("boldRanges:", boldRanges);
}
