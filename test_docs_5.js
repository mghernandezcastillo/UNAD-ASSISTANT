const parts = [
  "This is a **bold** text and this is **also bold**.\nSecond line."
];

for (let i = 0; i < parts.length; i++) {
  const text = parts[i];
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
  
  console.log("Original:", text);
  console.log("Cleaned:", cleanText);
  console.log("Bold ranges:", boldRanges);
  
  // if inserted at index 1:
  for (const range of boldRanges) {
    console.log(`Bold: ${cleanText.slice(range.startIndex, range.endIndex)} at ${1 + range.startIndex} to ${1 + range.endIndex}`);
  }
}
