/**
 * Cartflox Checkout Widget v2.0
 * Orchestrateur de Paiements Africains
 *
 * Installation:
 *   <script src="https://VOTRE-INSTANCE/cartflox.js"></script>
 *
 * Usage:
 *   Cartflox.configure({ publicKey: 'af_live_pub_xxxx' });
 *
 *   // Mode popup (iframe)
 *   Cartflox.checkout({
 *     amount: 5000, currency: 'XOF',
 *     customer_name: 'Kofi Anan',
 *     description: 'Commande #123',
 *     onSuccess: function(data) { console.log('Payé!', data); },
 *     onClose: function() {},
 *     onError: function(err) {}
 *   });
 *
 *   // Mode redirect (nouvelle page)
 *   Cartflox.checkout({ amount: 5000, mode: 'redirect',
 *     success_url: 'https://monsite.com/merci',
 *     cancel_url: 'https://monsite.com/annule'
 *   });
 *
 *   // Bouton auto
 *   <button data-afriflow-amount="5000" data-afriflow-description="Produit X">Payer</button>
 */
(function() {
    'use strict';

    var API_ENDPOINT = '/api/v1/checkout/sessions';
    var VERSION = '2.0.0';
    var config = { publicKey: '', baseUrl: '' };
    var overlay = null;
    var iframe = null;
    var currentCallbacks = {};

    // Detect base URL from script src
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || '';
        if (src.indexOf('afriflow.js') !== -1) {
            config.baseUrl = src.replace(/\/afriflow\.js.*$/, '');
            break;
        }
    }

    // --- Styles ---
    var STYLES = [
        '.afriflow-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);opacity:0;transition:opacity .3s ease}',
        '.afriflow-overlay.active{opacity:1}',
        '.afriflow-container{position:relative;width:100%;max-width:460px;height:90vh;max-height:700px;border-radius:16px;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.3);transform:translateY(20px) scale(0.98);transition:transform .3s ease}',
        '.afriflow-overlay.active .afriflow-container{transform:translateY(0) scale(1)}',
        '.afriflow-iframe{width:100%;height:100%;border:none;border-radius:16px;background:#F5F5F7}',
        '.afriflow-close{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,0.5);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;transition:background .2s}',
        '.afriflow-close:hover{background:rgba(0,0,0,0.7)}',
        '.afriflow-close svg{width:14px;height:14px;color:white}',
        '.afriflow-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#F5F5F7;border-radius:16px}',
        '.afriflow-spinner{width:40px;height:40px;border:3px solid #E5E7EB;border-top-color:#10B981;border-radius:50%;animation:afriflow-spin 1s linear infinite}',
        '@keyframes afriflow-spin{to{transform:rotate(360deg)}}',
        '.afriflow-loading-text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;color:#9CA3AF}',
        '.afriflow-brand{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:11px;color:#D1D5DB;display:flex;align-items:center;gap:4px;margin-top:4px}',
        '.afriflow-brand-dot{width:6px;height:6px;background:#10B981;border-radius:50%;display:inline-block}'
    ].join('\n');

    function injectStyles() {
        if (document.getElementById('afriflow-styles')) return;
        var style = document.createElement('style');
        style.id = 'afriflow-styles';
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    function createOverlay() {
        injectStyles();

        overlay = document.createElement('div');
        overlay.className = 'afriflow-overlay';
        overlay.innerHTML = [
            '<div class="afriflow-container">',
            '  <button class="afriflow-close" title="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>',
            '  <div class="afriflow-loading"><div class="afriflow-spinner"></div><span class="afriflow-loading-text">Préparation du paiement...</span><span class="afriflow-brand"><span class="afriflow-brand-dot"></span>Sécurisé par Cartflox</span></div>',
            '  <iframe class="afriflow-iframe" style="display:none"></iframe>',
            '</div>'
        ].join('');

        document.body.appendChild(overlay);

        iframe = overlay.querySelector('.afriflow-iframe');

        // Close button
        overlay.querySelector('.afriflow-close').addEventListener('click', closeOverlay);

        // Click outside to close
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeOverlay();
        });

        // ESC to close
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeOverlay();
        });

        // Animate in
        requestAnimationFrame(function() {
            overlay.classList.add('active');
        });
    }

    function closeOverlay() {
        if (!overlay) return;
        overlay.classList.remove('active');
        setTimeout(function() {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            overlay = null;
            iframe = null;
            if (currentCallbacks.onClose) currentCallbacks.onClose();
            currentCallbacks = {};
        }, 300);
    }

    function showCheckout(url) {
        if (!iframe) return;
        iframe.src = url;
        iframe.style.display = 'block';
        var loading = overlay.querySelector('.afriflow-loading');
        iframe.addEventListener('load', function() {
            if (loading) loading.style.display = 'none';
        });
    }

    // Listen for postMessage from checkout iframe (success, close)
    window.addEventListener('message', function(event) {
        if (!event.data || !event.data.type) return;

        if (event.data.type === 'afriflow:success') {
            if (currentCallbacks.onSuccess) currentCallbacks.onSuccess(event.data.payload || {});
            closeOverlay();
        }

        if (event.data.type === 'afriflow:close') {
            closeOverlay();
        }
    });

    // --- Public API ---
    window.Cartflox = {
        configure: function(opts) {
            if (opts.publicKey) config.publicKey = opts.publicKey;
            if (opts.baseUrl) config.baseUrl = opts.baseUrl;
        },

        checkout: function(opts) {
            if (!config.publicKey) {
                console.error('[Cartflox] Appelez Cartflox.configure({ publicKey: "..." }) d\'abord.');
                return;
            }

            var mode = opts.mode || config.mode || 'popup';

            currentCallbacks = {
                onSuccess: opts.onSuccess || null,
                onClose: opts.onClose || null,
                onError: opts.onError || null
            };

            if (mode === 'popup') createOverlay();

            var endpoint = config.baseUrl + API_ENDPOINT;
            var payload = {
                amount: opts.amount,
                currency: opts.currency || config.currency || 'XOF',
                customer_name: opts.customer_name || opts.customerName || '',
                customer_email: opts.customer_email || opts.customerEmail || '',
                customer_phone: opts.customer_phone || opts.customerPhone || '',
                description: opts.description || '',
                metadata: Object.assign({}, config.metadata || {}, opts.metadata || {}),
                success_url: opts.success_url || opts.successUrl || config.success_url || '',
                cancel_url: opts.cancel_url || opts.cancelUrl || config.cancel_url || ''
            };

            fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': config.publicKey
                },
                body: JSON.stringify(payload)
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.error) {
                    console.error('[Cartflox]', data.error);
                    if (currentCallbacks.onError) currentCallbacks.onError(data.error);
                    if (mode === 'popup') closeOverlay();
                    return;
                }
                if (mode === 'redirect') {
                    window.location.href = data.url;
                } else {
                    showCheckout(data.url);
                }
            })
            .catch(function(err) {
                console.error('[Cartflox] Network error:', err);
                if (currentCallbacks.onError) currentCallbacks.onError(err.message);
                if (mode === 'popup') closeOverlay();
            });
        },

        close: closeOverlay
    };

    // --- Boutons automatiques : data-cartflox-* (ou data-afriflow-*, ancien nom) ---
    function attr(btn, nom) {
        return btn.getAttribute('data-cartflox-' + nom) || btn.getAttribute('data-afriflow-' + nom) || '';
    }
    document.addEventListener('DOMContentLoaded', function() {
        var buttons = document.querySelectorAll('[data-cartflox-amount],[data-afriflow-amount]');
        buttons.forEach(function(btn) {
            btn.addEventListener('click', function(ev) {
                ev.preventDefault();
                window.Cartflox.checkout({
                    amount: Number(attr(btn, 'amount')),
                    currency: attr(btn, 'currency') || 'XOF',
                    customer_name: attr(btn, 'name'),
                    customer_email: attr(btn, 'email'),
                    customer_phone: attr(btn, 'phone'),
                    description: attr(btn, 'description'),
                    success_url: attr(btn, 'success-url'),
                    cancel_url: attr(btn, 'cancel-url'),
                    mode: attr(btn, 'mode') || undefined
                });
            });
        });
    });

    console.log('[Cartflox] Widget loaded. Call Cartflox.configure({ publicKey: "..." }) to start.');
})();
