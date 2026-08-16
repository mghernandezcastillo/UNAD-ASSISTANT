function buildRequests(parts) {
  let currentIndex = 1;
  const requests = [];

  for (let i = 0; i < parts.length; i++) {
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: parts[i]
      }
    });
    
    const start = currentIndex;
    const end = start + parts[i].length;
    
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
          range: { startIndex: start, endIndex: end },
          textStyle: { bold: true },
          fields: 'bold'
        }
      });
    } else {
      const titleLen = parts[i].indexOf('\n');
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
    
    currentIndex = end;
    
    if (i < parts.length - 1) {
      requests.push({
        insertPageBreak: {
          location: { index: currentIndex }
        }
      });
      currentIndex += 1; // page break is 1 character
    }
  }
  return requests;
}

console.log(JSON.stringify(buildRequests(["Cover\nLine 2\n", "Page 2\nBody"]), null, 2));
