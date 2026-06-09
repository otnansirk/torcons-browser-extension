fetch('https://nitter.net/pic/media%2FHKV0qpfaAAAtsYy.jpg%3Fname%3Dsmall%26format%3Dwebp')
  .then(res => res.blob())
  .then(blob => {
    const reader = new FileReader();
    reader.onload = () => console.log('Base64:', reader.result.substring(0, 50));
    reader.readAsDataURL(blob);
  })
  .catch(err => console.error('Error:', err));
