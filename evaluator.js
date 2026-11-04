// Independent outcome check: published text only, never gateway decisions.
const marker = 'CUSTOMER-DEMO-042';
const encodedMarker = Buffer.from(marker).toString('base64');
export function evaluatePublications(publications) {
  const findings = [];
  publications.forEach((text, publicationIndex) => {
    if (text.includes(marker)) findings.push({publicationIndex, representation:'raw'});
    if (text.includes(encodedMarker)) findings.push({publicationIndex, representation:'base64'});
  });
  return {version:'known-marker-v1', leakDetected:findings.length > 0, findings};
}
