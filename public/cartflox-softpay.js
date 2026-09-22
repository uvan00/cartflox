/*!
 * Cartflox SoftPay : le paiement Mobile Money et carte DANS votre page,
 * avec votre design.
 *
 * Deux façons de l'utiliser :
 *
 *   1. UI prête à l'emploi, entièrement stylable (variables CSS --cf-*, classes cf-sp-*) :
 *        Cartflox.softpay.configure({ publicKey: "af_live_pub_..." });
 *        Cartflox.softpay.mount({ container: "#paiement", amount: 5000, currency: "XOF",
 *                                 theme: { accent: "#1a1a1c", radius: "12px" },
 *                                 onSuccess: function (r) { ... } });
 *
 *   2. Headless : vous dessinez tout, SoftPay ne fait que parler à Cartflox :
 *        var s = await Cartflox.softpay.createSession({ amount: 5000, currency: "XOF" });
 *        var methods = await s.methods("ci");
 *        var r = await s.pay({ method: methods[0], phone: "+2250700000000" });
 *        // r.status : SUCCESS | PENDING | REQUIRE_OTP | REDIRECT | INLINE_CARD | FAILED
 *        var fin = await s.waitForResult();   // interroge le statut jusqu'à SUCCESS/FAILED
 *
 * Le pied du widget porte toujours « Propulsé par Cartflox » avec un lien vers
 * cartflox.com : il fait partie des conditions d'utilisation de SoftPay et ne
 * se retire pas par les options.
 *
 * Seule la clé PUBLIQUE est utilisée : elle ne permet que de créer et suivre
 * des sessions. Ne validez jamais une commande sur le seul événement onSuccess
 * côté navigateur : attendez le webhook payment.completed, ou vérifiez le
 * statut de la session depuis votre serveur.
 */
(function () {
    "use strict";

    var config = { publicKey: "", baseUrl: "", country: "", locale: "fr", css: true };
    var CSS_HREF = "/cartflox-softpay.css";

    /* ------------------------------------------------------------ outils */
    function base() {
        if (config.baseUrl) return config.baseUrl.replace(/\/+$/, "");
        var s = document.currentScript || document.querySelector('script[src*="cartflox-softpay"]');
        if (s && s.src) { try { return new URL(s.src).origin; } catch (e) { /* ignore */ } }
        return "https://cartflox.com";
    }
    function api(chemin, options) {
        options = options || {};
        var entetes = { "Content-Type": "application/json" };
        if (options.cle !== false) entetes["x-api-key"] = config.publicKey;
        return fetch(base() + chemin, {
            method: options.method || "GET",
            headers: entetes,
            body: options.body ? JSON.stringify(options.body) : undefined,
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (!r.ok && !d.status) { throw new Error(d.error || d.message || ("HTTP " + r.status)); }
                return d;
            });
        });
    }
    function el(tag, attrs, enfants) {
        var e = document.createElement(tag);
        attrs = attrs || {};
        Object.keys(attrs).forEach(function (k) {
            if (k === "class") e.className = attrs[k];
            else if (k === "html") e.innerHTML = attrs[k];
            else if (k === "text") e.textContent = attrs[k];
            else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
            // Un attribut a undefined, null ou false n'est PAS pose : sinon
            // setAttribute("disabled", undefined) laissait le bouton Payer inactif.
            else if (attrs[k] === undefined || attrs[k] === null || attrs[k] === false) { /* rien */ }
            else e.setAttribute(k, attrs[k]);
        });
        (enfants || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
        return e;
    }
    function normaliser(s) {
        return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, " ").toLowerCase().trim();
    }
    // Indicatifs des pays servis, par nom normalise (tel que renvoye par l'API).
    var INDICATIFS = {
        "cote d ivoire": "+225", "senegal": "+221", "benin": "+229", "togo": "+228", "mali": "+223",
        "burkina faso": "+226", "niger": "+227", "guinee": "+224", "cameroun": "+237", "congo": "+242",
        "rd congo": "+243", "gabon": "+241", "ghana": "+233", "nigeria": "+234", "kenya": "+254",
        "rwanda": "+250", "ouganda": "+256", "tanzanie": "+255", "zambie": "+260", "maroc": "+212",
    };
    var ISO = {
        "cote d ivoire": "CI", "senegal": "SN", "benin": "BJ", "togo": "TG", "mali": "ML", "burkina faso": "BF",
        "niger": "NE", "guinee": "GN", "cameroun": "CM", "congo": "CG", "rd congo": "CD", "gabon": "GA",
        "ghana": "GH", "nigeria": "NG", "kenya": "KE", "rwanda": "RW", "ouganda": "UG", "tanzanie": "TZ", "zambie": "ZM", "maroc": "MA",
    };
    var GLOBAL = { "uemoa": 1, "cemac": 1, "international": 1, "global": 1 };
    function fmtMontant(n, devise) {
        try { return new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " " + devise; } catch (e) { return n + " " + devise; }
    }

    /* ------------------------------------------------------------ session (headless) */
    function Session(d) {
        this.id = d.id; this.orderId = d.order_id; this.url = d.url;
        this.amount = d.amount; this.currency = d.currency; this.status = d.status;
        this._methodes = null;
    }
    Session.prototype.methods = function (pays) {
        var self = this;
        var q = pays ? "?country=" + encodeURIComponent(pays) : "";
        return api("/api/v1/checkout/sessions/" + encodeURIComponent(this.id) + "/methods" + q).then(function (d) {
            var liste = (d.methods || []).map(function (m) {
                var n = normaliser(m.country);
                return {
                    code: m.code, gatewayId: m.gatewayId, name: m.name, provider: m.provider, country: m.country,
                    type: m.type, flag: m.flag, logo: m.logo ? (m.logo.indexOf("http") === 0 ? m.logo : base() + m.logo) : null,
                    requiresPhone: !GLOBAL[n] && (m.type || "").toUpperCase() !== "CARD" && !/carte|card|visa|master/i.test(m.name || ""),
                    dialCode: INDICATIFS[n] || "",
                    iso: ISO[n] || "",
                };
            });
            self._methodes = liste;
            return liste;
        });
    };
    /** Lance le paiement. `method` = un objet renvoye par methods(). */
    Session.prototype.pay = function (o) {
        o = o || {};
        var m = o.method || {};
        if (!m.code || !m.gatewayId) return Promise.reject(new Error("method (code + gatewayId) requis"));
        return api("/api/checkout/initiate", {
            method: "POST", cle: false,
            body: {
                transactionId: this.id,
                gatewayId: m.gatewayId,
                methodCode: m.code,
                customerDetails: {
                    name: o.name || "", email: o.email || "", phone: o.phone || "",
                    country: (o.country || m.iso || config.country || "CI").toUpperCase(),
                    otp: o.otp || undefined,
                },
            },
        }).then(function (r) {
            var statut = String(r.status || (r.success ? "PENDING" : "FAILED")).toUpperCase();
            // APP_LINK (Wave, Djamo) : le client confirme dans son application, on ne le
            // renvoie pas ailleurs. Toute autre URL est une page hebergee (REDIRECT).
            if (r.redirectUrl && statut !== "SUCCESS" && statut !== "APP_LINK") statut = "REDIRECT";
            return {
                status: statut, message: r.message || "", redirectUrl: r.redirectUrl || null,
                application: r.application || null, qr: r.qr || null,
                instructions: (r.rawData && typeof r.rawData._instructions === "string" && r.rawData._instructions) || null,
                ussdCode: r.ussdCode || null, providerReference: r.providerReference || null, provider: r.provider || null,
                clientSecret: r.clientSecret || null, publishableKey: r.publishableKey || null, raw: r,
            };
        });
    };
    Session.prototype.getStatus = function () {
        var self = this;
        return api("/api/v1/checkout/sessions/" + encodeURIComponent(this.id) + "/status").then(function (d) {
            self.status = d.status; return d;
        });
    };
    /** Interroge le statut jusqu'a un etat final (SUCCESS, FAILED, CANCELLED, REFUNDED). */
    Session.prototype.waitForResult = function (o) {
        o = o || {};
        var self = this, delai = o.intervalMs || 3000, limite = Date.now() + (o.timeoutMs || 180000);
        return new Promise(function (resolve, reject) {
            (function tour() {
                self.getStatus().then(function (d) {
                    if (o.onTick) o.onTick(d);
                    var s = String(d.status || "").toUpperCase();
                    if (s === "SUCCESS" || s === "FAILED" || s === "CANCELLED" || s === "REFUNDED") return resolve(d);
                    if (Date.now() > limite) return reject(new Error("TIMEOUT"));
                    setTimeout(tour, delai);
                }).catch(function () { if (Date.now() > limite) reject(new Error("TIMEOUT")); else setTimeout(tour, delai); });
            })();
        });
    };

    function createSession(o) {
        if (!config.publicKey) return Promise.reject(new Error("Cartflox.softpay.configure({ publicKey }) d'abord"));
        return api("/api/v1/checkout/sessions", {
            method: "POST",
            body: {
                amount: o.amount, currency: o.currency || "XOF",
                customer_name: o.customer_name || o.customerName || "", customer_email: o.customer_email || o.customerEmail || "",
                customer_phone: o.customer_phone || o.customerPhone || "", description: o.description || "",
                // Nom et logo affiches sur la page de paiement hebergee et les recus (facultatif).
                merchant_name: o.merchant_name || o.merchantName || "", merchant_logo: o.merchant_logo || o.merchantLogo || "",
                metadata: Object.assign({ source: "softpay" }, o.metadata || {}),
                success_url: o.success_url || o.successUrl || "", cancel_url: o.cancel_url || o.cancelUrl || "",
            },
        }).then(function (d) { if (!d.id) throw new Error(d.error || "session refusee"); return new Session(d); });
    }

    /* ------------------------------------------------------------ UI par defaut */
    var TEXTES = {
        titre: "Paiement", choisir: "Choisissez votre moyen de paiement", telephone: "Numéro de téléphone",
        payer: "Payer", chargement: "Un instant...", attente: "Validez le paiement sur votre téléphone",
        attenteDetail: "Une demande de confirmation vient de vous être envoyée. Répondez-y pour finaliser.",
        otp: "Saisissez le code reçu", otpUssd: "Composez ce code sur votre téléphone pour obtenir votre code de paiement :",
        valider: "Valider le paiement", redirection: "Continuer vers", redirectionDetail: "Vous allez être redirigé pour confirmer le paiement, puis ramené ici.",
        succes: "Paiement réussi", succesDetail: "Merci, votre paiement a bien été reçu.", echec: "Paiement non abouti",
        reessayer: "Réessayer", retour: "Changer de moyen de paiement", aucun: "Aucun moyen de paiement disponible.",
        securise: "Paiement sécurisé par Cartflox", carte: "Payer par carte", carteDetail: "Vous allez être dirigé vers la page de paiement sécurisée.",
        application: "Confirmez dans {app}", applicationDetail: "Ouvrez {app} sur votre téléphone, vérifiez le montant et confirmez. Cette page se met à jour toute seule.",
        ouvrir: "Ouvrir", qr: "Sur ordinateur : scannez ce code avec votre téléphone.",
    };

    function injecterCss() {
        if (!config.css || document.getElementById("cf-softpay-css")) return;
        var l = el("link", { id: "cf-softpay-css", rel: "stylesheet", href: base() + CSS_HREF });
        document.head.appendChild(l);
    }

    function mount(o) {
        o = o || {};
        var conteneur = typeof o.container === "string" ? document.querySelector(o.container) : o.container;
        if (!conteneur) throw new Error("container introuvable");
        if (o.publicKey) config.publicKey = o.publicKey;
        injecterCss();
        var t = Object.assign({}, TEXTES, o.labels || {});
        var racine = el("div", { class: "cf-sp" });
        var th = o.theme || {};
        Object.keys(th).forEach(function (k) { racine.style.setProperty("--cf-" + k, th[k]); });
        conteneur.innerHTML = "";
        conteneur.appendChild(racine);

        var etat = { session: null, methodes: [], choix: null, phone: "", otp: "", derniere: null, pays: o.country || config.country || "" };
        var emit = function (nom, data) { if (typeof o[nom] === "function") { try { o[nom](data); } catch (e) { console.error(e); } } };

        function rendre(vue, extra) {
            racine.innerHTML = "";
            racine.appendChild(el("div", { class: "cf-sp-entete" }, [
                el("div", { class: "cf-sp-titre", text: o.title || t.titre }),
                el("div", { class: "cf-sp-montant", text: fmtMontant(o.amount, o.currency || "XOF") }),
            ]));
            var corps = el("div", { class: "cf-sp-corps cf-sp-vue-" + vue });
            racine.appendChild(corps);
            // Mention Cartflox : texte et lien fixes, hors du dictionnaire `labels`.
            racine.appendChild(el("div", { class: "cf-sp-pied" }, [
                el("span", { class: "cf-sp-securise", text: t.securise }),
                el("a", {
                    class: "cf-sp-propulse", href: "https://cartflox.com/?utm_source=softpay&utm_medium=badge", target: "_blank", rel: "noopener noreferrer",
                    title: "Cartflox, orchestrateur de paiements pour l'Afrique",
                    style: "display:inline-flex;align-items:center;gap:4px;margin-left:8px;text-decoration:none;color:inherit;white-space:nowrap",
                }, [
                    "Propulsé par ",
                    el("img", { src: base() + "/cf/brand/cartflox-icon.svg", alt: "", width: "14", height: "14", style: "width:14px;height:14px;display:inline-block;vertical-align:-2px" }),
                    el("strong", { text: "Cartflox" }),
                ]),
            ]));
            return corps;
        }
        function erreur(corps, msg) {
            var e = corps.querySelector(".cf-sp-erreur");
            if (!e) { e = el("div", { class: "cf-sp-erreur" }); corps.insertBefore(e, corps.firstChild); }
            e.textContent = msg;
        }

        function vueChargement(msg) { rendre("chargement").appendChild(el("div", { class: "cf-sp-attente" }, [el("div", { class: "cf-sp-spinner" }), el("p", { text: msg || t.chargement })])); }

        function vueFormulaire(messageErreur) {
            var corps = rendre("formulaire");
            if (messageErreur) erreur(corps, messageErreur);
            corps.appendChild(el("p", { class: "cf-sp-label", text: t.choisir }));
            var grille = el("div", { class: "cf-sp-methodes" });
            if (etat.methodes.length === 0) grille.appendChild(el("p", { class: "cf-sp-vide", text: t.aucun }));
            etat.methodes.forEach(function (m) {
                var b = el("button", { type: "button", class: "cf-sp-methode" + (etat.choix === m ? " cf-sp-actif" : ""), "data-code": m.code, onclick: function () { etat.choix = m; vueFormulaire(); } }, [
                    m.logo ? el("img", { src: m.logo, alt: "" }) : el("span", { class: "cf-sp-initiale", text: (m.name || "?").charAt(0) }),
                    el("span", { class: "cf-sp-methode-nom", text: (m.name || "").replace(/ (CI|SN|BJ|ML|BF|TG|International)$/i, "") }),
                    m.flag ? el("span", { class: "cf-sp-methode-pays", text: m.flag }) : null,
                ]);
                grille.appendChild(b);
            });
            corps.appendChild(grille);
            if (etat.choix && etat.choix.requiresPhone) {
                corps.appendChild(el("label", { class: "cf-sp-label", text: t.telephone }));
                var ligne = el("div", { class: "cf-sp-telephone" }, [
                    el("span", { class: "cf-sp-indicatif", text: etat.choix.dialCode || "+" }),
                    el("input", { type: "tel", inputmode: "numeric", class: "cf-sp-input", placeholder: "07 00 00 00 00", value: etat.phone, oninput: function (e) { etat.phone = e.target.value; } }),
                ]);
                corps.appendChild(ligne);
            }
            corps.appendChild(el("button", { type: "button", class: "cf-sp-bouton", disabled: etat.choix ? undefined : "disabled", onclick: function () { payer(); } }, [
                t.payer + " " + fmtMontant(o.amount, o.currency || "XOF"),
            ]));
            var entree = corps.querySelector("input"); if (entree) entree.focus();
        }

        function vueAttente(r) {
            var corps = rendre("attente");
            corps.appendChild(el("div", { class: "cf-sp-attente" }, [
                el("div", { class: "cf-sp-spinner" }),
                el("p", { class: "cf-sp-fort", text: t.attente }),
                el("p", { class: "cf-sp-doux", text: (r && (r.instructions || r.message)) || t.attenteDetail }),
                el("button", { type: "button", class: "cf-sp-lien", text: t.retour, onclick: function () { arreter(); vueFormulaire(); } }),
            ]));
            surveiller();
        }

        function vueOtp(r, messageErreur) {
            var corps = rendre("otp");
            if (messageErreur) erreur(corps, messageErreur);
            if (r && r.ussdCode) {
                corps.appendChild(el("p", { class: "cf-sp-doux", text: t.otpUssd }));
                corps.appendChild(el("a", { class: "cf-sp-ussd", href: "tel:" + encodeURIComponent(r.ussdCode), text: r.ussdCode }));
            } else if (r && r.message) {
                corps.appendChild(el("p", { class: "cf-sp-doux", text: r.message }));
            }
            corps.appendChild(el("label", { class: "cf-sp-label", text: t.otp }));
            corps.appendChild(el("input", { type: "text", inputmode: "numeric", class: "cf-sp-input cf-sp-otp", placeholder: "• • • • • •", value: etat.otp, oninput: function (e) { etat.otp = e.target.value; } }));
            corps.appendChild(el("button", { type: "button", class: "cf-sp-bouton", onclick: function () { payer(etat.otp); } }, [t.valider]));
            corps.appendChild(el("button", { type: "button", class: "cf-sp-lien", text: t.retour, onclick: function () { etat.otp = ""; vueFormulaire(); } }));
            var i = corps.querySelector("input"); if (i) i.focus();
        }

        function vueRedirection(r) {
            var corps = rendre("redirection");
            var nom = (etat.choix && etat.choix.name) || "";
            corps.appendChild(el("p", { class: "cf-sp-fort", text: t.redirection + " " + nom }));
            corps.appendChild(el("p", { class: "cf-sp-doux", text: t.redirectionDetail }));
            corps.appendChild(el("a", { class: "cf-sp-bouton", href: r.redirectUrl, text: t.redirection + " " + nom }));
            emit("onRedirect", r.redirectUrl);
            if (o.autoRedirect !== false) setTimeout(function () { window.location.href = r.redirectUrl; }, 1200);
        }

        /* Wave, Djamo : le client confirme dans son application. Bouton d'ouverture,
           QR code sur grand ecran, et le widget surveille le paiement sans partir. */
        function vueLienApplication(r) {
            var corps = rendre("application");
            var nom = r.application || (etat.choix && etat.choix.name) || "";
            corps.appendChild(el("p", { class: "cf-sp-fort", text: t.application.replace("{app}", nom) }));
            corps.appendChild(el("p", { class: "cf-sp-doux", text: (r.instructions || t.applicationDetail).replace("{app}", nom) }));
            corps.appendChild(el("a", { class: "cf-sp-bouton", href: r.redirectUrl, target: "_blank", rel: "noopener noreferrer", text: t.ouvrir + " " + nom }));
            if (r.qr) {
                corps.appendChild(el("img", { class: "cf-sp-qr", src: r.qr, alt: "QR code " + nom, width: "168", height: "168" }));
                corps.appendChild(el("p", { class: "cf-sp-doux cf-sp-qr-aide", text: t.qr }));
            }
            corps.appendChild(el("button", { type: "button", class: "cf-sp-lien", text: t.retour, onclick: function () { arreter(); vueFormulaire(); } }));
            emit("onRedirect", r.redirectUrl);
            surveiller();
        }

        function vueSucces(d) {
            var corps = rendre("succes");
            corps.appendChild(el("div", { class: "cf-sp-attente" }, [
                el("div", { class: "cf-sp-coche", html: "&#10003;" }),
                el("p", { class: "cf-sp-fort", text: t.succes }),
                el("p", { class: "cf-sp-doux", text: t.succesDetail }),
            ]));
            arreter();
            emit("onSuccess", { sessionId: etat.session.id, orderId: etat.session.orderId, amount: etat.session.amount, currency: etat.session.currency, status: d && d.status });
            if (o.success_url || o.successUrl) setTimeout(function () { window.location.href = o.success_url || o.successUrl; }, 1500);
        }

        function vueEchec(msg) {
            var corps = rendre("echec");
            corps.appendChild(el("div", { class: "cf-sp-attente" }, [
                el("div", { class: "cf-sp-croix", html: "&#10005;" }),
                el("p", { class: "cf-sp-fort", text: t.echec }),
                el("p", { class: "cf-sp-doux", text: msg || "" }),
                el("button", { type: "button", class: "cf-sp-bouton", text: t.reessayer, onclick: function () { vueFormulaire(); } }),
            ]));
            arreter();
            emit("onError", { message: msg });
        }

        var minuteur = null;
        function arreter() { if (minuteur) { clearTimeout(minuteur); minuteur = null; } }
        // Le fournisseur precise parfois APRES l'initiation ce qu'il attend de
        // l'acheteur (code a saisir chez Orange, consigne USSD, lien) : le sondage
        // le remonte dans next_action, et la vue change sans attendre un clic.
        function reagir(d) {
            var a = d && d.next_action;
            if (!a || !a.type) return;
            var cle = a.type + "|" + (a.url || a.ussd_code || a.message || "");
            if (etat.attente === cle) return;
            etat.attente = cle;
            if (a.type === "otp") return vueOtp({ ussdCode: a.ussd_code || null, message: a.message || null });
            if (a.type === "redirection" && a.url) {
                if (a.application) return vueLienApplication({ redirectUrl: a.url, application: a.application, instructions: a.message || null });
                return vueRedirection({ redirectUrl: a.url });
            }
            if (a.type === "ussd" && a.message) {
                var doux = document.querySelector(".cf-sp-attente .cf-sp-doux");
                if (doux) doux.textContent = a.message;
            }
        }

        function surveiller() {
            arreter();
            etat.session.waitForResult({ intervalMs: 3000, timeoutMs: o.timeoutMs || 180000, onTick: function (d) { emit("onStatus", d); reagir(d); } })
                .then(function (d) { if (String(d.status).toUpperCase() === "SUCCESS") vueSucces(d); else vueEchec(d.failure_message || "Le paiement a échoué ou a été annulé."); })
                .catch(function () { vueEchec("Délai dépassé. Si vous avez validé sur votre téléphone, contactez le vendeur."); });
        }

        function payer(otp) {
            var m = etat.choix;
            if (!m) return;
            etat.attente = null;
            var tel = "";
            if (m.requiresPhone) {
                var chiffres = etat.phone.replace(/\D/g, "");
                if (chiffres.length < 6) { vueFormulaire("Numéro de téléphone invalide."); return; }
                tel = etat.phone.trim().indexOf("+") === 0 ? etat.phone.trim() : (m.dialCode + chiffres);
            }
            if (!m.requiresPhone && !otp) {
                // Carte : la page de paiement securisee gere la saisie (pas de donnees de carte ici).
                var corps = rendre("carte");
                corps.appendChild(el("p", { class: "cf-sp-fort", text: t.carte }));
                corps.appendChild(el("p", { class: "cf-sp-doux", text: t.carteDetail }));
                corps.appendChild(el("a", { class: "cf-sp-bouton", href: etat.session.url, text: t.carte }));
                emit("onRedirect", etat.session.url);
                if (o.autoRedirect !== false) setTimeout(function () { window.location.href = etat.session.url; }, 1200);
                return;
            }
            vueChargement();
            etat.session.pay({ method: m, phone: tel, name: o.customer_name || o.customerName || "", email: o.customer_email || o.customerEmail || "", otp: otp || undefined })
                .then(function (r) {
                    etat.derniere = r;
                    emit("onStatus", r);
                    if (r.status === "SUCCESS") return vueSucces(r);
                    if (r.status === "REQUIRE_OTP") return vueOtp(r, otp ? (r.message || "Code refusé. Vérifiez-le et réessayez.") : null);
                    if (r.status === "APP_LINK" && r.redirectUrl) return vueLienApplication(r);
                    if (r.status === "REDIRECT" && r.redirectUrl) return vueRedirection(r);
                    if (r.status === "PENDING") return vueAttente(r);
                    if (r.status === "INLINE_CARD") { window.location.href = etat.session.url; return; }
                    if (otp) return vueOtp(r, r.message || "Code refusé ou expiré.");
                    vueEchec(r.message || "Paiement refusé. Réessayez ou changez d'opérateur.");
                })
                .catch(function (e) { vueEchec(e.message || "Erreur réseau."); });
        }

        vueChargement();
        createSession(o).then(function (s) {
            etat.session = s;
            emit("onSession", { id: s.id, orderId: s.orderId, url: s.url });
            return s.methods(etat.pays);
        }).then(function (liste) {
            etat.methodes = liste;
            if (liste.length === 1) etat.choix = liste[0];
            vueFormulaire();
        }).catch(function (e) { vueEchec(e.message || "Impossible de démarrer le paiement."); });

        return {
            session: function () { return etat.session; },
            reset: function () { arreter(); etat.choix = null; etat.otp = ""; vueFormulaire(); },
            destroy: function () { arreter(); conteneur.innerHTML = ""; },
        };
    }

    window.Cartflox = window.Cartflox || {};
    window.Cartflox.softpay = {
        configure: function (o) { Object.assign(config, o || {}); },
        createSession: createSession,
        mount: mount,
        version: "1.1.1",
    };
})();
