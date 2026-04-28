/**
 * ════════════════════════════════════════════
 * THE DAILY REFLECTION TREE — Agent Engine
 * ════════════════════════════════════════════
 * 
 * A fully deterministic tree-walking engine.
 * Loads the tree from a JSON data file, walks nodes,
 * accumulates signals, interpolates text, and
 * produces a reflection summary.
 * 
 * NO LLM calls. NO randomness. NO free text.
 * Same answers → same path → same reflection. Every time.
 */

(function () {
    'use strict';

    /* ═══════════════════════════
       State
       ═══════════════════════════ */
    let treeData = null;
    let nodeMap = {};
    let state = {
        answers: {},         // nodeId → selected option text
        signals: {           // axis → pole → count
            axis1: { internal: 0, external: 0 },
            axis2: { contribution: 0, entitlement: 0 },
            axis3: { self: 0, others: 0 }
        },
        path: [],            // ordered list of { nodeId, type, text?, answer? }
        currentNodeId: null,
        lastSignal: {}       // axis → last pole recorded
    };

    /* ═══════════════════════════
       DOM References
       ═══════════════════════════ */
    const $ = (sel) => document.querySelector(sel);
    const landingScreen = $('#landing-screen');
    const reflectionScreen = $('#reflection-screen');
    const summaryScreen = $('#summary-screen');
    const beginBtn = $('#begin-btn');
    const nodeText = $('#node-text');
    const optionsContainer = $('#options-container');
    const continueBtn = $('#continue-btn');
    const axisBadge = $('#axis-badge');
    const progressFill = $('#progress-fill');
    const restartBtn = $('#restart-btn');

    /* ═══════════════════════════
       Particle Background
       ═══════════════════════════ */
    function initParticles() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const container = $('#particles-canvas');
        container.appendChild(canvas);

        let particles = [];
        const PARTICLE_COUNT = 40;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        function createParticle() {
            return {
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 0.5,
                speedY: -(Math.random() * 0.3 + 0.1),
                speedX: (Math.random() - 0.5) * 0.2,
                opacity: Math.random() * 0.4 + 0.1,
                pulse: Math.random() * Math.PI * 2
            };
        }

        function init() {
            resize();
            particles = Array.from({ length: PARTICLE_COUNT }, createParticle);
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.y += p.speedY;
                p.x += p.speedX;
                p.pulse += 0.01;
                const currentOpacity = p.opacity * (0.6 + Math.sin(p.pulse) * 0.4);

                if (p.y < -10) {
                    p.y = canvas.height + 10;
                    p.x = Math.random() * canvas.width;
                }

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(212, 165, 116, ${currentOpacity})`;
                ctx.fill();
            });
            requestAnimationFrame(animate);
        }

        init();
        animate();
        window.addEventListener('resize', resize);
    }

    /* ═══════════════════════════
       Load Tree Data
       ═══════════════════════════ */
    async function loadTree() {
        try {
            const resp = await fetch('../tree/reflection-tree.json');
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            treeData = await resp.json();
            nodeMap = {};
            treeData.nodes.forEach(n => { nodeMap[n.id] = n; });
            console.log(`[Tree] Loaded ${treeData.nodes.length} nodes.`);
        } catch (err) {
            console.error('[Tree] Failed to load tree data:', err);
            nodeText.textContent = 'Could not load the reflection tree. Please ensure reflection-tree.json is in the /tree/ folder.';
        }
    }

    /* ═══════════════════════════
       Reset State
       ═══════════════════════════ */
    function resetState() {
        state = {
            answers: {},
            signals: {
                axis1: { internal: 0, external: 0 },
                axis2: { contribution: 0, entitlement: 0 },
                axis3: { self: 0, others: 0 }
            },
            path: [],
            currentNodeId: null,
            lastSignal: {}
        };
    }

    /* ═══════════════════════════
       Interpolation
       ═══════════════════════════ */
    function interpolate(text) {
        if (!text) return '';
        return text.replace(/\{(\w+)\.answer\}/g, (match, nodeId) => {
            return state.answers[nodeId] || match;
        });
    }

    /* ═══════════════════════════
       Signal Helpers
       ═══════════════════════════ */
    function recordSignal(signalStr) {
        if (!signalStr) return;
        const [axis, pole] = signalStr.split(':');
        if (state.signals[axis] && state.signals[axis][pole] !== undefined) {
            state.signals[axis][pole]++;
            state.lastSignal[axis] = pole;
        }
    }

    function getDominant(axis) {
        const s = state.signals[axis];
        const poles = Object.keys(s);
        const max = Math.max(...poles.map(p => s[p]));
        const winners = poles.filter(p => s[p] === max);
        if (winners.length > 1) return 'mixed';
        return winners[0];
    }

    /* ═══════════════════════════
       Decision Evaluation
       ═══════════════════════════ */
    function evaluateDecision(node) {
        for (const rule of node.rules) {
            switch (rule.type) {
                case 'answer': {
                    const ans = state.answers[rule.nodeId];
                    if (ans && rule.matches.includes(ans)) {
                        return rule.target;
                    }
                    break;
                }
                case 'last_signal': {
                    if (state.lastSignal[rule.axis] === rule.value) {
                        return rule.target;
                    }
                    break;
                }
                case 'signal_dominant': {
                    const dom = getDominant(rule.axis);
                    if (dom === rule.value) {
                        return rule.target;
                    }
                    break;
                }
                case 'default':
                    return rule.target;
            }
        }
        // Fallback to last rule
        const lastRule = node.rules[node.rules.length - 1];
        return lastRule.target;
    }

    /* ═══════════════════════════
       Progress Tracking
       ═══════════════════════════ */
    function updateProgress() {
        const currentNode = nodeMap[state.currentNodeId];
        let progress = 0;
        let activeAxis = 0;

        if (state.currentNodeId) {
            const id = state.currentNodeId;
            if (id.startsWith('A1') || id === 'BRIDGE_12') {
                activeAxis = 1;
                progress = id === 'BRIDGE_12' ? 33 : Math.min(33, 5 + state.path.length * 4);
            } else if (id.startsWith('A2') || id === 'BRIDGE_23') {
                activeAxis = 2;
                progress = id === 'BRIDGE_23' ? 66 : Math.min(66, 33 + state.path.filter(p => p.nodeId.startsWith('A2')).length * 6);
            } else if (id.startsWith('A3') || id === 'CLOSING') {
                activeAxis = 3;
                progress = Math.min(95, 66 + state.path.filter(p => p.nodeId.startsWith('A3')).length * 6);
            } else if (id === 'SUMMARY' || id === 'END') {
                activeAxis = 3;
                progress = 100;
            }
        }

        progressFill.style.width = `${progress}%`;

        document.querySelectorAll('.progress-label').forEach(label => {
            const axis = parseInt(label.dataset.axis);
            label.classList.remove('active', 'completed');
            if (axis === activeAxis) label.classList.add('active');
            else if (axis < activeAxis) label.classList.add('completed');
        });
    }

    /* ═══════════════════════════
       Axis Badge
       ═══════════════════════════ */
    const AXIS_NAMES = {
        axis1: 'Axis 1 — Agency',
        axis2: 'Axis 2 — Orientation',
        axis3: 'Axis 3 — Radius'
    };

    function updateAxisBadge(node) {
        if (node.axis && AXIS_NAMES[node.axis]) {
            axisBadge.textContent = AXIS_NAMES[node.axis];
            axisBadge.classList.remove('hidden');
        } else {
            axisBadge.classList.add('hidden');
        }
    }

    /* ═══════════════════════════
       Render Node
       ═══════════════════════════ */
    function renderNode(nodeId) {
        const node = nodeMap[nodeId];
        if (!node) {
            console.error(`[Tree] Node not found: ${nodeId}`);
            return;
        }

        state.currentNodeId = nodeId;
        updateProgress();

        // Handle non-visible node types
        if (node.type === 'decision') {
            const target = evaluateDecision(node);
            state.path.push({ nodeId: node.id, type: 'decision', target });
            renderNode(target);
            return;
        }

        // Handle summary — switch to summary screen
        if (node.type === 'summary') {
            state.path.push({ nodeId: node.id, type: 'summary' });
            showSummary();
            return;
        }

        // Handle end
        if (node.type === 'end') {
            state.path.push({ nodeId: node.id, type: 'end' });
            return;
        }

        // Visible nodes: start, question, reflection, bridge
        const text = interpolate(node.text);

        // Update axis badge
        updateAxisBadge(node);

        // Clear and animate
        nodeText.style.animation = 'none';
        nodeText.offsetHeight; // trigger reflow
        nodeText.style.animation = '';
        optionsContainer.style.animation = 'none';
        optionsContainer.offsetHeight;
        optionsContainer.style.animation = '';

        // Set text styling
        nodeText.className = 'node-text';
        if (node.type === 'reflection') nodeText.classList.add('reflection-text');
        if (node.type === 'bridge') nodeText.classList.add('bridge-text');
        nodeText.textContent = text;

        // Clear options
        optionsContainer.innerHTML = '';
        continueBtn.classList.add('hidden');

        if (node.type === 'question' && node.options) {
            // Render selectable options
            node.options.forEach((opt, i) => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.textContent = opt.text;
                btn.style.animationDelay = `${0.4 + i * 0.08}s`;
                btn.id = `option-${nodeId}-${i}`;

                btn.addEventListener('click', () => {
                    handleOptionSelect(node, opt, btn);
                });

                optionsContainer.appendChild(btn);
            });

            state.path.push({ nodeId: node.id, type: 'question', text: node.text });

        } else if (node.type === 'start' || node.type === 'bridge') {
            // Auto-advance after delay
            state.path.push({ nodeId: node.id, type: node.type, text });
            setTimeout(() => {
                if (state.currentNodeId === nodeId && node.next) {
                    renderNode(node.next);
                }
            }, node.type === 'start' ? 3000 : 2200);

        } else if (node.type === 'reflection') {
            // Show continue button
            state.path.push({ nodeId: node.id, type: 'reflection', text });
            continueBtn.classList.remove('hidden');
            continueBtn.onclick = () => {
                if (node.next) renderNode(node.next);
            };
        }
    }

    /* ═══════════════════════════
       Handle Option Selection
       ═══════════════════════════ */
    function handleOptionSelect(node, selectedOption, selectedBtn) {
        // Record answer
        state.answers[node.id] = selectedOption.text;

        // Record signal
        if (selectedOption.signal) {
            recordSignal(selectedOption.signal);
        }

        // Update path
        const pathEntry = state.path.find(p => p.nodeId === node.id);
        if (pathEntry) pathEntry.answer = selectedOption.text;

        // Visual feedback
        selectedBtn.classList.add('selected');

        // Fade out other options
        const allBtns = optionsContainer.querySelectorAll('.option-btn');
        allBtns.forEach(btn => {
            if (btn !== selectedBtn) {
                btn.classList.add('fading');
            }
            btn.style.pointerEvents = 'none';
        });

        // Advance after brief pause
        setTimeout(() => {
            if (node.next) {
                renderNode(node.next);
            }
        }, 700);
    }

    /* ═══════════════════════════
       Summary
       ═══════════════════════════ */
    function showSummary() {
        reflectionScreen.classList.remove('active');
        summaryScreen.classList.add('active');

        const dom1 = getDominant('axis1');
        const dom2 = getDominant('axis2');
        const dom3 = getDominant('axis3');

        const templates = treeData.meta.summaryTemplates;

        // Axis labels
        const a1Label = templates.axis1[dom1] || templates.axis1.mixed;
        const a2Label = templates.axis2[dom2] || templates.axis2.mixed;
        const a3Label = templates.axis3[dom3] || templates.axis3.mixed;

        // Insights
        $('#insight-axis1').textContent = `Today you leaned toward ${a1Label}.`;
        $('#insight-axis2').textContent = `Your attention was drawn to ${a2Label}.`;
        $('#insight-axis3').textContent = `Your radius of concern was ${a3Label}.`;

        // Spectrum indicators
        setTimeout(() => {
            setIndicator('axis1', dom1, state.signals.axis1);
            setIndicator('axis2', dom2, state.signals.axis2);
            setIndicator('axis3', dom3, state.signals.axis3);
        }, 800);

        // Closing message
        const closingKey = getClosingKey(dom1, dom2, dom3);
        const closingText = templates.closingMessages[closingKey];
        $('#summary-closing').innerHTML = `<p>${closingText}</p>`;

        // Path visualization
        renderPath();
    }

    function setIndicator(axis, dominant, signals) {
        const indicator = $(`#indicator-${axis}`);
        const poles = Object.keys(signals);
        const total = poles.reduce((sum, p) => sum + signals[p], 0);

        if (total === 0) {
            indicator.style.left = '50%';
            return;
        }

        // Calculate position: left pole → 10%, right pole → 90%
        const rightPole = poles[1]; // internal, contribution, others
        const rightRatio = signals[rightPole] / total;
        const position = 10 + rightRatio * 80;
        indicator.style.left = `${position}%`;
    }

    function getClosingKey(dom1, dom2, dom3) {
        const positiveCount = [
            dom1 === 'internal',
            dom2 === 'contribution',
            dom3 === 'others'
        ].filter(Boolean).length;

        if (positiveCount === 3) return 'positive';
        if (positiveCount === 0) return 'compassionate';
        if (positiveCount >= 2) return 'growth';
        return 'mixed';
    }

    function renderPath() {
        const pathSteps = $('#path-steps');
        pathSteps.innerHTML = '';

        state.path
            .filter(p => p.type === 'question' && p.answer)
            .forEach(p => {
                const div = document.createElement('div');
                div.className = 'path-step';

                const node = nodeMap[p.nodeId];
                const cleanQ = interpolate(node.text).replace(/"/g, '');

                div.innerHTML = `
                    <span class="step-question">${cleanQ}</span><br>
                    → <span class="step-answer">${p.answer}</span>
                `;
                pathSteps.appendChild(div);
            });
    }

    /* ═══════════════════════════
       Screen Management
       ═══════════════════════════ */
    function showReflection() {
        landingScreen.classList.remove('active');
        summaryScreen.classList.remove('active');
        reflectionScreen.classList.add('active');
        renderNode('START');
    }

    /* ═══════════════════════════
       Init
       ═══════════════════════════ */
    async function init() {
        initParticles();
        await loadTree();

        beginBtn.addEventListener('click', showReflection);

        restartBtn.addEventListener('click', () => {
            resetState();
            summaryScreen.classList.remove('active');
            landingScreen.classList.add('active');
        });
    }

    // Boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
