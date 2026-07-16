// Erreur HTTP typee, partagee entre le routeur (index.js) et les modules
// qui doivent remonter un statut precis (oauth.js...). Le catch global du
// routeur la convertit en reponse JSON { error } avec le bon code.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
