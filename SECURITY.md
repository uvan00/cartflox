# Sécurité

Cartflox manipule des clés d'agrégateurs et de l'argent. Si vous trouvez une faille, ne l'exposez pas publiquement : écrivez à **security@cartflox.com** avec les étapes pour la reproduire. Nous accusons réception sous 48 heures et vous tenons informé jusqu'à la correction.

Ce qui est en place dans le code :

- clés d'agrégateurs chiffrées en base (AES-256-GCM, clé dérivée par espace, clé maître hors base) et jamais renvoyées au navigateur ;
- journaux des réponses fournisseurs masqués à l'écriture ;
- webhooks entrants vérifiés par signature quand le fournisseur en fournit une, et sinon confirmés par une relecture chez lui ;
- webhooks sortants signés HMAC-SHA256, avec horodatage ;
- limitation de débit sur l'authentification et l'API (Redis partagé si `REDIS_URL` est défini) ;
- cookie de session `Secure`, `SameSite=Lax`, session courte ;
- adresses e-mail temporaires refusées à l'inscription.

Versions prises en charge : la branche `main`.
