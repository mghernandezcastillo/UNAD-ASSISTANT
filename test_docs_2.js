function buildRequests(parts) {
  let currentIndex = 1;
  const requests = [];

  for (let i = 0; i < parts.length; i++) {
    // 1. Insert the text first
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: parts[i]
      }
    });
    
    const start = currentIndex;
    const end = start + parts[i].length;
    const titleLen = parts[i].indexOf('\n');
    
    // 2. Add style formatting requests
    if (i === 0) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end },
          paragraphStyle: { alignment: 'CENTER' },
          fields: 'alignment'
        }
      });
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: start + titleLen },
          textStyle: { bold: true },
          fields: 'bold'
        }
      });
    } else {
      if (titleLen > 0) {
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: start, endIndex: start + titleLen },
            paragraphStyle: { alignment: 'CENTER' },
            fields: 'alignment'
          }
        });
        requests.push({
          updateTextStyle: {
            range: { startIndex: start, endIndex: start + titleLen },
            textStyle: { bold: true },
            fields: 'bold'
          }
        });
      }
    }
    
    // 3. Move index past the text we just inserted
    currentIndex = end;
  }
  
  // NOTE: In Google Docs API, it's safer to insert PageBreaks separately and ideally in reverse order 
  // to avoid index shifting, OR insert them sequentially at the correct accumulated index.
  // When you insert a page break, it inserts a specific character/element at that index.
  
  // A better approach is to append the page breaks at the end of each text part string 
  // before sending it to the Docs API? No, page breaks are structurally different.
  // However, \f (form feed) character is treated as a page break by Docs API in insertText!
  return requests;
}

const reqsWithFormFeed = [];
const text1 = "Page 1\nLine 2\n\f";
const text2 = "Page 2\nBody\n\f";
reqsWithFormFeed.push({ insertText: { location: { index: 1 }, text: text1 } });
reqsWithFormFeed.push({ insertText: { location: { index: 1 + text1.length }, text: text2 } });

console.log(JSON.stringify(reqsWithFormFeed, null, 2));

