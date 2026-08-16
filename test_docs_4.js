const fs = require('fs');

function buildRequests() {
  const markdownText = "MOCK TEXT";
  const task = { title: "Title" };
  const profile = { name: "Name", idDocument: "123", school: "ECISA", program: "Program" };
  const parts = [
    `${task?.title}\n\n\n\nEstudiante:\n${profile?.name}\nCC: ${profile?.idDocument}\n\n\nGrupo:\n[Número de Grupo]\n\n\nDocente:\n[Nombre del Docente/Tutor]\n\n\nUniversidad Nacional Abierta y a Distancia - UNAD\n${profile?.school || "Escuela"}\nPrograma ${profile?.program || "Programa"}\n${new Date().getFullYear()}\n`,
    `Contenido\n\nIntroducción ........................................................................................ 3\nObjetivos ........................................................................................... 4\nDesarrollo de la Actividad .................................................................. 5\nConclusiones .................................................................................... 6\nReferencias ....................................................................................... 7\n`,
  ];
  
  const requests = [];

  for (let i = parts.length - 1; i >= 0; i--) {
    requests.push({
      insertText: {
        location: { index: 1 },
        text: parts[i]
      }
    });
    const titleLen = parts[i].indexOf('\n');
    if (i === 0) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: 1, endIndex: 1 + parts[i].length },
          paragraphStyle: { alignment: 'CENTER' },
          fields: 'alignment'
        }
      });
    } else {
      if (titleLen > 0) {
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: 1, endIndex: 1 + titleLen },
            paragraphStyle: { alignment: 'CENTER' },
            fields: 'alignment'
          }
        });
      }
    }
    if (i > 0) {
      requests.push({
        insertPageBreak: {
          location: { index: 1 }
        }
      });
    }
  }
  return requests;
}
console.log(JSON.stringify(buildRequests(), null, 2));
