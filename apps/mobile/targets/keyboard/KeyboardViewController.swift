import UIKit

private let appGroupSuite = "group.com.ethanwoo.ccbridge"
private let bridgeServerURLKey = "bridge_server_url"

private struct SharedBridgeConfig {
    let serverURL: String
}

private struct KeyboardConversationEntryPayload: Codable {
    let text: String
    let senderIdentifier: String?
    let sentDate: String?
    let entryIdentifier: String?
    let replyThreadIdentifier: String?
    let primaryRecipientIdentifiers: [String]?
}

private struct KeyboardConversationContextPayload: Codable {
    let threadIdentifier: String?
    let entries: [KeyboardConversationEntryPayload]?
    let selfIdentifiers: [String]?
    let responsePrimaryRecipientIdentifiers: [String]?
    let participantNameByIdentifier: [String: String]?
}

private struct KeyboardRequestPayload: Codable {
    let prompt: String
    let selectedText: String?
    let documentContextBeforeInput: String?
    let documentContextAfterInput: String?
    let documentIdentifier: String?
    let conversationContext: KeyboardConversationContextPayload?
}

private struct KeyboardResponseSuccess: Codable {
    let reply: String
    let durationMs: Int
}

private struct KeyboardResponseError: Codable {
    let error: String
}

// MARK: - Data Types

private enum KeyboardMode {
    case input
    case loading
    case result
}

private enum KeyType {
    case character(String)
    case shift
    case backspace
    case space
    case returnSend
    case nextKeyboard
    case toggleNumbers
    case period
}

private struct KeyDefinition {
    let type: KeyType
    let label: String
    let widthMultiplier: CGFloat
}

// MARK: - RotatingGlowBorder

private final class RotatingGlowBorder: UIView {

    private let containerLayer = CALayer()
    private let gradientLayer = CAGradientLayer()
    private let borderMask = CAShapeLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear

        // Container holds the gradient and is masked to the border ring
        borderMask.fillRule = .evenOdd
        containerLayer.mask = borderMask
        containerLayer.addSublayer(gradientLayer)
        layer.addSublayer(containerLayer)

        // Conic gradient for the rotating light
        gradientLayer.type = .conic
        gradientLayer.startPoint = CGPoint(x: 0.5, y: 0.5)
        gradientLayer.endPoint = CGPoint(x: 0.5, y: 0)

        // Glow shadow on the view layer (not clipped by the mask)
        layer.shadowOffset = .zero
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func updateAppearance(bright: UIColor) {
        gradientLayer.colors = [
            bright.withAlphaComponent(0.9).cgColor,
            bright.withAlphaComponent(0.35).cgColor,
            bright.withAlphaComponent(0.0).cgColor,
            bright.withAlphaComponent(0.0).cgColor,
            bright.withAlphaComponent(0.35).cgColor,
            bright.withAlphaComponent(0.9).cgColor,
        ]
        gradientLayer.locations = [0, 0.1, 0.25, 0.75, 0.9, 1.0]
        layer.shadowColor = bright.cgColor
        layer.shadowRadius = 8
        layer.shadowOpacity = 0.3
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            ensureAnimating()
        }
    }

    private func ensureAnimating() {
        guard gradientLayer.animation(forKey: "rotate") == nil else { return }
        let rotation = CABasicAnimation(keyPath: "transform.rotation.z")
        rotation.fromValue = 0
        rotation.toValue = CGFloat.pi * 2
        rotation.duration = 3.0
        rotation.repeatCount = .infinity
        rotation.isRemovedOnCompletion = false
        gradientLayer.add(rotation, forKey: "rotate")
    }

    override func layoutSubviews() {
        super.layoutSubviews()

        let cornerRadius: CGFloat = 12
        let borderWidth: CGFloat = 1.5

        containerLayer.frame = bounds

        // Gradient: square, diagonal-sized, centered so rotation never exposes gaps
        let diag = sqrt(bounds.width * bounds.width + bounds.height * bounds.height)
        gradientLayer.bounds = CGRect(x: 0, y: 0, width: diag, height: diag)
        gradientLayer.position = CGPoint(x: bounds.midX, y: bounds.midY)

        // Border ring mask: outer rounded rect minus inner rounded rect
        let outer = UIBezierPath(roundedRect: bounds, cornerRadius: cornerRadius)
        let inner = UIBezierPath(
            roundedRect: bounds.insetBy(dx: borderWidth, dy: borderWidth),
            cornerRadius: cornerRadius - borderWidth
        )
        outer.append(inner.reversing())
        borderMask.path = outer.cgPath

        // Shadow path for the glow
        layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: cornerRadius).cgPath
    }
}

// MARK: - KeyPreviewView

private final class KeyPreviewView: UIView {

    private let shapeLayer = CAShapeLayer()
    private let characterLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isHidden = true
        isUserInteractionEnabled = false

        shapeLayer.fillColor = UIColor.white.cgColor
        shapeLayer.shadowColor = UIColor.black.cgColor
        shapeLayer.shadowOpacity = 0.3
        shapeLayer.shadowOffset = CGSize(width: 0, height: 1)
        shapeLayer.shadowRadius = 1
        layer.addSublayer(shapeLayer)

        characterLabel.font = UIFont.systemFont(ofSize: 36, weight: .light)
        characterLabel.textColor = .label
        characterLabel.textAlignment = .center
        addSubview(characterLabel)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func show(for button: UIButton, character: String, in coordinateView: UIView) {
        guard let superview else { return }
        let keyRect = button.convert(button.bounds, to: superview)

        let balloonWidth = keyRect.width + 24
        let balloonHeight: CGFloat = 62
        let taperHeight: CGFloat = 12
        let cornerRadius: CGFloat = 8

        let totalWidth = balloonWidth
        let totalHeight = balloonHeight + taperHeight

        let balloonLeft = keyRect.midX - balloonWidth / 2
        let balloonTop = keyRect.minY - balloonHeight - taperHeight

        frame = CGRect(x: balloonLeft, y: balloonTop, width: totalWidth, height: totalHeight)
        shapeLayer.frame = bounds

        // Build path in local coordinates
        let path = UIBezierPath()

        // Bottom-left of taper (aligned with key left edge)
        let taperLeftX = keyRect.minX - balloonLeft
        let taperRightX = keyRect.maxX - balloonLeft
        let taperBottomY = totalHeight
        let balloonBottomY = balloonHeight

        // Start at bottom-left of taper (key top-left)
        path.move(to: CGPoint(x: taperLeftX, y: taperBottomY))

        // Quad curve up-left to balloon bottom-left
        path.addQuadCurve(
            to: CGPoint(x: 0, y: balloonBottomY),
            controlPoint: CGPoint(x: taperLeftX, y: balloonBottomY)
        )

        // Left side up to top-left corner
        path.addLine(to: CGPoint(x: 0, y: cornerRadius))

        // Top-left corner
        path.addArc(
            withCenter: CGPoint(x: cornerRadius, y: cornerRadius),
            radius: cornerRadius, startAngle: .pi, endAngle: .pi * 1.5, clockwise: true
        )

        // Top side
        path.addLine(to: CGPoint(x: totalWidth - cornerRadius, y: 0))

        // Top-right corner
        path.addArc(
            withCenter: CGPoint(x: totalWidth - cornerRadius, y: cornerRadius),
            radius: cornerRadius, startAngle: .pi * 1.5, endAngle: 0, clockwise: true
        )

        // Right side down to balloon bottom-right
        path.addLine(to: CGPoint(x: totalWidth, y: balloonBottomY))

        // Quad curve down-right to taper bottom-right (key top-right)
        path.addQuadCurve(
            to: CGPoint(x: taperRightX, y: taperBottomY),
            controlPoint: CGPoint(x: taperRightX, y: balloonBottomY)
        )

        path.close()

        shapeLayer.path = path.cgPath

        // Center label in balloon area
        characterLabel.text = character
        characterLabel.frame = CGRect(x: 0, y: 0, width: totalWidth, height: balloonHeight)

        isHidden = false
    }

    func hide() {
        isHidden = true
    }

    func updateAppearance(fillColor: UIColor, shadowOpacity: Float) {
        // Lighten the fill slightly so the preview stands out from the key
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        fillColor.getRed(&r, green: &g, blue: &b, alpha: &a)
        let lift: CGFloat = 0.12
        let lighter = UIColor(
            red: min(r + (1 - r) * lift, 1),
            green: min(g + (1 - g) * lift, 1),
            blue: min(b + (1 - b) * lift, 1),
            alpha: a
        )
        shapeLayer.fillColor = lighter.cgColor
        shapeLayer.shadowOpacity = shadowOpacity
        characterLabel.textColor = .label
    }
}

// MARK: - KeyboardViewController

final class KeyboardViewController: UIInputViewController {

    private static let nameFormatter = PersonNameComponentsFormatter()

    // MARK: State

    private var latestReply = ""
    private var latestResultText = ""
    private var latestConversationContext: AnyObject?
    private var debugLog: [String] = []
    private var keyboardHeightConstraint: NSLayoutConstraint?

    private var currentMode: KeyboardMode = .input {
        didSet { transitionToMode(currentMode) }
    }

    private var promptText: String = "" {
        didSet {
            promptField.text = promptText.isEmpty ? nil : promptText
            updatePromptPlaceholderVisibility()
            updateRow3SendButtonState()
        }
    }

    private var isShifted: Bool = false
    private var isCapsLocked: Bool = false
    private var isNumberMode: Bool = false
    private var lastShiftTapTime: Date?
    private var backspaceTimer: Timer?
    private var backspaceDeleteCount: Int = 0
    private var keyMap: [UIButton: KeyDefinition] = [:]

    // MARK: UI References

    private let promptField = UITextField()
    private let promptRow = UIStackView()
    private let promptGlow = RotatingGlowBorder()
    private let keyboardContainer = UIStackView()
    private let resultContainer = UIStackView()
    private let resultActionRow = UIStackView()
    private let outputView = UITextView()
    private let loadingOverlay = UIView()
    private let loadingLabel = UILabel()
    private let resultGlobeButton = UIButton(type: .system)
    private let newPromptButton = UIButton(type: .system)
    private let resultInsertButton = UIButton(type: .system)

    private var shiftKeyButton: UIButton?
    private var row3SendButton: UIButton?

    private let haptic = UIImpactFeedbackGenerator(style: .light)
    private lazy var keyPreview = KeyPreviewView()

    // MARK: Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        debugLog.append("viewDidLoad")
        Self.nameFormatter.style = .default
        haptic.prepare()
        configureHierarchy()
        applyAppearance()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (self: Self, _) in
            self.applyAppearance()
        }
        transitionToMode(currentMode)
    }

    override func updateViewConstraints() {
        if keyboardHeightConstraint == nil {
            let constraint = view.heightAnchor.constraint(equalToConstant: 280)
            constraint.priority = .defaultHigh
            constraint.isActive = true
            keyboardHeightConstraint = constraint
        }
        super.updateViewConstraints()
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        if currentMode == .result {
            resultGlobeButton.isHidden = !needsInputModeSwitchKey
        }
    }

    override func textDidChange(_ textInput: (any UITextInput)?) {
        debugLog.append("textDidChange: textInput=\(textInput != nil ? "present" : "nil")")
        if #available(iOS 18.4, *), let textInput {
            if let ctx = textInput.conversationContext ?? nil {
                debugLog.append("  .conversationContext=present(\(ctx.entries.count) entries)")
            } else {
                debugLog.append("  .conversationContext=nil")
            }
        }
        captureConversationContext(from: textInput)
    }

    @available(iOS 18.4, *)
    override func conversationContext(_ context: UIConversationContext?, didChange textInput: (any UITextInput)?) {
        if let context {
            debugLog.append("conversationContext(didChange): present(\(context.entries.count) entries)")
        } else {
            debugLog.append("conversationContext(didChange): nil")
        }
        latestConversationContext = context
    }

    // MARK: - Hierarchy Setup

    private func configureHierarchy() {
        view.backgroundColor = .clear

        // Prompt row
        configurePromptRow()

        // Keyboard container
        configureKeyboardContainer()

        // Result container
        configureResultContainer()

        // Loading overlay
        configureLoadingOverlay()

        // Layout constraints
        promptRow.translatesAutoresizingMaskIntoConstraints = false
        keyboardContainer.translatesAutoresizingMaskIntoConstraints = false
        resultContainer.translatesAutoresizingMaskIntoConstraints = false
        loadingOverlay.translatesAutoresizingMaskIntoConstraints = false

        promptGlow.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(promptGlow)
        view.addSubview(promptRow)
        view.addSubview(keyboardContainer)
        view.addSubview(resultContainer)
        view.addSubview(loadingOverlay)
        view.addSubview(keyPreview)

        NSLayoutConstraint.activate([
            // Prompt row: top with 10px padding, sides with 8px
            promptRow.topAnchor.constraint(equalTo: view.topAnchor, constant: 10),
            promptRow.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
            promptRow.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -8),
            promptRow.heightAnchor.constraint(equalToConstant: 40),

            // Glow border: matches prompt row
            promptGlow.topAnchor.constraint(equalTo: promptRow.topAnchor),
            promptGlow.leadingAnchor.constraint(equalTo: promptRow.leadingAnchor),
            promptGlow.trailingAnchor.constraint(equalTo: promptRow.trailingAnchor),
            promptGlow.bottomAnchor.constraint(equalTo: promptRow.bottomAnchor),

            // Keyboard container: below prompt row with 12px spacing
            keyboardContainer.topAnchor.constraint(equalTo: promptRow.bottomAnchor, constant: 12),
            keyboardContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 3),
            keyboardContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -3),
            keyboardContainer.heightAnchor.constraint(equalToConstant: 206),

            // Result container: same position as keyboard container
            resultContainer.topAnchor.constraint(equalTo: promptRow.bottomAnchor, constant: 12),
            resultContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 3),
            resultContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -3),
            resultContainer.heightAnchor.constraint(equalToConstant: 206),

            // Loading overlay: same frame as keyboard container
            loadingOverlay.topAnchor.constraint(equalTo: keyboardContainer.topAnchor),
            loadingOverlay.leadingAnchor.constraint(equalTo: keyboardContainer.leadingAnchor),
            loadingOverlay.trailingAnchor.constraint(equalTo: keyboardContainer.trailingAnchor),
            loadingOverlay.bottomAnchor.constraint(equalTo: keyboardContainer.bottomAnchor),
        ])

        // Build initial letter key rows
        buildKeyRows()
    }

    private func configurePromptRow() {
        promptRow.axis = .horizontal
        promptRow.alignment = .fill
        promptRow.distribution = .fill
        promptRow.spacing = 6

        // Prompt field (display only)
        promptField.isUserInteractionEnabled = false
        promptField.borderStyle = .none
        promptField.layer.cornerRadius = 12
        promptField.layer.cornerCurve = .continuous
        promptField.layer.borderWidth = 0
        promptField.font = UIFont.systemFont(ofSize: 15)
        promptField.leftViewMode = .always
        promptField.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 10, height: 1))
        promptField.rightViewMode = .always
        promptField.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 10, height: 1))

        promptRow.addArrangedSubview(promptField)
    }

    private func configureKeyboardContainer() {
        keyboardContainer.axis = .vertical
        keyboardContainer.alignment = .fill
        keyboardContainer.distribution = .fill
        keyboardContainer.spacing = 10
    }

    private func configureResultContainer() {
        resultContainer.axis = .vertical
        resultContainer.alignment = .fill
        resultContainer.distribution = .fill
        resultContainer.spacing = 4
        resultContainer.isHidden = true

        // Result action row
        resultActionRow.axis = .horizontal
        resultActionRow.alignment = .center
        resultActionRow.distribution = .fill
        resultActionRow.spacing = 8

        let globeConfig = UIImage.SymbolConfiguration(pointSize: 16, weight: .regular)
        let globeImage = UIImage(systemName: "globe", withConfiguration: globeConfig)
        resultGlobeButton.setImage(globeImage, for: .normal)
        resultGlobeButton.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)

        // "New Prompt" button
        var newPromptConfig = UIButton.Configuration.filled()
        newPromptConfig.title = "New Prompt"
        newPromptConfig.cornerStyle = .capsule
        newPromptConfig.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)
        newPromptButton.configuration = newPromptConfig
        newPromptButton.titleLabel?.font = UIFont.systemFont(ofSize: 14, weight: .medium)
        newPromptButton.addTarget(self, action: #selector(onNewPrompt), for: .touchUpInside)

        // Spacer
        let spacer = UIView()
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        spacer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        // "Insert" button
        var insertConfig = UIButton.Configuration.filled()
        insertConfig.title = "Insert"
        insertConfig.cornerStyle = .capsule
        insertConfig.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)
        resultInsertButton.configuration = insertConfig
        resultInsertButton.titleLabel?.font = UIFont.systemFont(ofSize: 14, weight: .medium)
        resultInsertButton.addTarget(self, action: #selector(onInsert), for: .touchUpInside)

        resultActionRow.addArrangedSubview(resultGlobeButton)
        resultActionRow.addArrangedSubview(newPromptButton)
        resultActionRow.addArrangedSubview(spacer)
        resultActionRow.addArrangedSubview(resultInsertButton)

        resultActionRow.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            resultActionRow.heightAnchor.constraint(equalToConstant: 34),
        ])

        // Output view
        outputView.isEditable = false
        outputView.isSelectable = true
        outputView.font = UIFont.preferredFont(forTextStyle: .body)
        outputView.layer.cornerRadius = 10
        outputView.layer.cornerCurve = .continuous
        outputView.layer.borderWidth = 1
        outputView.layer.masksToBounds = true
        outputView.textContainerInset = UIEdgeInsets(top: 10, left: 10, bottom: 10, right: 10)

        resultContainer.addArrangedSubview(resultActionRow)
        resultContainer.addArrangedSubview(outputView)
    }

    private func configureLoadingOverlay() {
        loadingOverlay.isHidden = true
        loadingOverlay.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.7)
        loadingOverlay.layer.cornerRadius = 10

        loadingLabel.text = "Asking Claude..."
        loadingLabel.font = UIFont.systemFont(ofSize: 16, weight: .medium)
        loadingLabel.textColor = .label
        loadingLabel.textAlignment = .center
        loadingLabel.translatesAutoresizingMaskIntoConstraints = false

        loadingOverlay.addSubview(loadingLabel)
        NSLayoutConstraint.activate([
            loadingLabel.centerXAnchor.constraint(equalTo: loadingOverlay.centerXAnchor),
            loadingLabel.centerYAnchor.constraint(equalTo: loadingOverlay.centerYAnchor),
        ])
    }

    // MARK: - Key Row Building

    private func buildKeyRows() {
        // Remove existing arranged subviews
        for subview in keyboardContainer.arrangedSubviews {
            keyboardContainer.removeArrangedSubview(subview)
            subview.removeFromSuperview()
        }

        // Clear keyMap entries (but keep the map for new keys)
        keyMap.removeAll()
        shiftKeyButton = nil
        row3SendButton = nil

        if isNumberMode {
            buildNumberRows()
        } else {
            buildLetterRows()
        }

        // Always build row 3 (bottom row)
        buildBottomRow()
    }

    private func buildLetterRows() {
        // Row 0: Q W E R T Y U I O P
        let row0Keys: [KeyDefinition] = "QWERTYUIOP".map {
            KeyDefinition(type: .character(String($0)), label: String($0), widthMultiplier: 1.0)
        }
        let row0 = makeKeyRow(keys: row0Keys, rowIndex: 0)
        keyboardContainer.addArrangedSubview(row0)

        // Grab a row 0 key to use as width reference
        let row0RefButton = keyMap.first(where: {
            if case .character("Q") = $0.value.type { return true }
            return false
        })?.key

        // Row 1: A S D F G H J K L (centered with spacers, matching row 0 key width)
        let row1Keys: [KeyDefinition] = "ASDFGHJKL".map {
            KeyDefinition(type: .character(String($0)), label: String($0), widthMultiplier: 1.0)
        }
        let row1 = makeKeyRow(keys: row1Keys, rowIndex: 1, centered: true)
        keyboardContainer.addArrangedSubview(row1)

        // Constrain row 1 keys to match row 0 key width
        if let ref = row0RefButton {
            for (button, def) in keyMap {
                if case .character(let c) = def.type, "ASDFGHJKL".contains(c) {
                    button.widthAnchor.constraint(equalTo: ref.widthAnchor).isActive = true
                }
            }
        }

        // Row 2: Shift [gap] Z X C V B N M [gap] Backspace
        let row2 = UIStackView()
        row2.axis = .horizontal
        row2.alignment = .fill
        row2.distribution = .fill
        row2.spacing = 6
        row2.translatesAutoresizingMaskIntoConstraints = false

        let shiftDef = KeyDefinition(type: .shift, label: "shift", widthMultiplier: 1.3)
        let shiftButton = makeKeyButton(definition: shiftDef, isSpecial: true)
        row2.addArrangedSubview(shiftButton)

        let leftGap = UIView()
        leftGap.translatesAutoresizingMaskIntoConstraints = false
        leftGap.widthAnchor.constraint(equalToConstant: 4).isActive = true
        row2.addArrangedSubview(leftGap)

        var row2CharButtons: [UIButton] = []
        for c in "ZXCVBNM" {
            let def = KeyDefinition(type: .character(String(c)), label: String(c), widthMultiplier: 1.0)
            let btn = makeKeyButton(definition: def, isSpecial: false)
            row2.addArrangedSubview(btn)
            row2CharButtons.append(btn)
        }

        let rightGap = UIView()
        rightGap.translatesAutoresizingMaskIntoConstraints = false
        rightGap.widthAnchor.constraint(equalToConstant: 4).isActive = true
        row2.addArrangedSubview(rightGap)

        let bkspDef = KeyDefinition(type: .backspace, label: "delete.left", widthMultiplier: 1.3)
        let bkspButton = makeKeyButton(definition: bkspDef, isSpecial: true)
        row2.addArrangedSubview(bkspButton)

        // Equal-width character keys, shift/backspace proportional
        if let first = row2CharButtons.first {
            for other in row2CharButtons.dropFirst() {
                other.widthAnchor.constraint(equalTo: first.widthAnchor).isActive = true
            }
            shiftButton.widthAnchor.constraint(equalTo: first.widthAnchor, multiplier: 1.3).isActive = true
            bkspButton.widthAnchor.constraint(equalTo: first.widthAnchor, multiplier: 1.3).isActive = true
        }

        row2.heightAnchor.constraint(equalToConstant: 44).isActive = true
        keyboardContainer.addArrangedSubview(row2)
    }

    private func buildNumberRows() {
        // Row 0: 1 2 3 4 5 6 7 8 9 0
        let row0Keys: [KeyDefinition] = "1234567890".map {
            KeyDefinition(type: .character(String($0)), label: String($0), widthMultiplier: 1.0)
        }
        let row0 = makeKeyRow(keys: row0Keys, rowIndex: 0)
        keyboardContainer.addArrangedSubview(row0)

        // Row 1: - / : ; ( ) $ & @ "
        let row1Chars: [String] = ["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""]
        let row1Keys: [KeyDefinition] = row1Chars.map {
            KeyDefinition(type: .character($0), label: $0, widthMultiplier: 1.0)
        }
        let row1 = makeKeyRow(keys: row1Keys, rowIndex: 1)
        keyboardContainer.addArrangedSubview(row1)

        // Row 2: [#+=] . , ? ! ' [backspace]
        var row2Keys: [KeyDefinition] = []
        row2Keys.append(KeyDefinition(type: .toggleNumbers, label: "#+=", widthMultiplier: 1.5))
        for c in [".", ",", "?", "!", "'"] {
            row2Keys.append(KeyDefinition(type: .character(c), label: c, widthMultiplier: 1.0))
        }
        row2Keys.append(KeyDefinition(type: .backspace, label: "delete.left", widthMultiplier: 1.5))
        let row2 = makeKeyRow(keys: row2Keys, rowIndex: 2)
        keyboardContainer.addArrangedSubview(row2)
    }

    private func buildBottomRow() {
        // Row 3: [123/ABC] [globe] [space flexible] [send]
        let row3 = UIStackView()
        row3.axis = .horizontal
        row3.alignment = .fill
        row3.distribution = .fill
        row3.spacing = 6
        row3.translatesAutoresizingMaskIntoConstraints = false

        // 123/ABC toggle key
        let toggleLabel = isNumberMode ? "ABC" : "123"
        let toggleDef = KeyDefinition(type: .toggleNumbers, label: toggleLabel, widthMultiplier: 1.5)
        let toggleButton = makeKeyButton(definition: toggleDef, isSpecial: true)
        row3.addArrangedSubview(toggleButton)

        // Space bar (flexible)
        let spaceDef = KeyDefinition(type: .space, label: "space", widthMultiplier: 1.0)
        let spaceButton = UIButton(type: .system)
        spaceButton.setTitle("space", for: .normal)
        spaceButton.titleLabel?.font = UIFont.systemFont(ofSize: 16)
        spaceButton.setTitleColor(.label, for: .normal)
        spaceButton.backgroundColor = keyBackgroundColor(isSpecial: false)
        spaceButton.layer.cornerRadius = 8
        spaceButton.layer.cornerCurve = .continuous
        spaceButton.layer.shadowColor = UIColor.black.cgColor
        spaceButton.layer.shadowOpacity = 0.3
        spaceButton.layer.shadowOffset = CGSize(width: 0, height: 1)
        spaceButton.layer.shadowRadius = 1
        keyMap[spaceButton] = spaceDef
        spaceButton.addTarget(self, action: #selector(keyTouchDown(_:)), for: .touchDown)
        spaceButton.addTarget(self, action: #selector(keyTapped(_:)), for: .touchUpInside)
        spaceButton.addTarget(self, action: #selector(keyTouchCancelled(_:)), for: .touchUpOutside)
        spaceButton.addTarget(self, action: #selector(keyTouchCancelled(_:)), for: .touchCancel)
        spaceButton.setContentHuggingPriority(.defaultLow, for: .horizontal)
        spaceButton.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        row3.addArrangedSubview(spaceButton)

        // Send key (arrow.up)
        let sendDef = KeyDefinition(type: .returnSend, label: "arrow.up", widthMultiplier: 1.5)
        let row3Send = UIButton(type: .system)
        let sendConfig = UIImage.SymbolConfiguration(pointSize: 16, weight: .semibold)
        let sendImage = UIImage(systemName: "arrow.up", withConfiguration: sendConfig)
        row3Send.setImage(sendImage, for: .normal)
        row3Send.tintColor = .white
        row3Send.backgroundColor = .systemBlue
        row3Send.layer.cornerRadius = 8
        row3Send.layer.cornerCurve = .continuous
        row3Send.layer.shadowColor = UIColor.black.cgColor
        row3Send.layer.shadowOpacity = 0.3
        row3Send.layer.shadowOffset = CGSize(width: 0, height: 1)
        row3Send.layer.shadowRadius = 1
        row3Send.translatesAutoresizingMaskIntoConstraints = false
        keyMap[row3Send] = sendDef
        row3Send.addTarget(self, action: #selector(keyTouchDown(_:)), for: .touchDown)
        row3Send.addTarget(self, action: #selector(keyTapped(_:)), for: .touchUpInside)
        row3Send.addTarget(self, action: #selector(keyTouchCancelled(_:)), for: .touchUpOutside)
        row3Send.addTarget(self, action: #selector(keyTouchCancelled(_:)), for: .touchCancel)
        row3Send.isEnabled = !promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        row3Send.alpha = row3Send.isEnabled ? 1.0 : 0.4
        row3SendButton = row3Send
        row3.addArrangedSubview(row3Send)

        // Fixed width for non-space keys; space takes remaining room
        let unitWidth: CGFloat = 40
        toggleButton.widthAnchor.constraint(equalToConstant: unitWidth * 1.5).isActive = true
        row3Send.widthAnchor.constraint(equalToConstant: unitWidth * 1.5).isActive = true

        toggleButton.setContentHuggingPriority(.required, for: .horizontal)
        row3Send.setContentHuggingPriority(.required, for: .horizontal)
        toggleButton.setContentCompressionResistancePriority(.required, for: .horizontal)
        row3Send.setContentCompressionResistancePriority(.required, for: .horizontal)

        // Row height
        row3.heightAnchor.constraint(equalToConstant: 44).isActive = true

        keyboardContainer.addArrangedSubview(row3)
    }

    // MARK: - Key Row Factory

    private func makeKeyRow(keys: [KeyDefinition], rowIndex: Int, centered: Bool = false) -> UIStackView {
        let row = UIStackView()
        row.axis = .horizontal
        row.alignment = .fill
        row.spacing = 6
        row.translatesAutoresizingMaskIntoConstraints = false

        var standardButtons: [UIButton] = []
        var wideButtons: [(UIButton, CGFloat)] = []

        if centered {
            let leadingSpacer = UIView()
            leadingSpacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
            leadingSpacer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            row.addArrangedSubview(leadingSpacer)
        }

        for keyDef in keys {
            let isSpecial: Bool
            switch keyDef.type {
            case .character:
                isSpecial = false
            default:
                isSpecial = true
            }
            let button = makeKeyButton(definition: keyDef, isSpecial: isSpecial)
            row.addArrangedSubview(button)

            if keyDef.widthMultiplier != 1.0 {
                wideButtons.append((button, keyDef.widthMultiplier))
            } else {
                standardButtons.append(button)
            }
        }

        if centered {
            let trailingSpacer = UIView()
            trailingSpacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
            trailingSpacer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            row.addArrangedSubview(trailingSpacer)

            if let leading = row.arrangedSubviews.first, let trailing = row.arrangedSubviews.last {
                trailing.widthAnchor.constraint(equalTo: leading.widthAnchor).isActive = true
            }
        }

        if wideButtons.isEmpty && !centered {
            // All keys same width (e.g. QWERTYUIOP): fillEqually
            row.distribution = .fillEqually
        } else {
            row.distribution = .fill
            // Constrain all standard-width keys to equal width
            if let first = standardButtons.first {
                for other in standardButtons.dropFirst() {
                    other.widthAnchor.constraint(equalTo: first.widthAnchor).isActive = true
                }
                // Constrain wide keys proportional to standard keys
                for (wideButton, multiplier) in wideButtons {
                    wideButton.widthAnchor.constraint(equalTo: first.widthAnchor, multiplier: multiplier).isActive = true
                }
            }
        }

        row.heightAnchor.constraint(equalToConstant: 44).isActive = true
        return row
    }

    private func makeKeyButton(definition: KeyDefinition, isSpecial: Bool) -> UIButton {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false

        // Configure appearance based on type
        switch definition.type {
        case .character:
            button.setTitle(isShifted || isCapsLocked ? definition.label.uppercased() : definition.label.lowercased(), for: .normal)
            button.titleLabel?.font = UIFont.systemFont(ofSize: 26, weight: .light)
            button.setTitleColor(.label, for: .normal)
            button.backgroundColor = keyBackgroundColor(isSpecial: false)
            button.titleEdgeInsets = UIEdgeInsets(top: -2, left: 0, bottom: 2, right: 0)

        case .shift:
            let symbolName: String
            if isCapsLocked {
                symbolName = "capslock.fill"
            } else if isShifted {
                symbolName = "shift.fill"
            } else {
                symbolName = "shift"
            }
            let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .light)
            button.setImage(UIImage(systemName: symbolName, withConfiguration: config), for: .normal)
            button.tintColor = .label
            button.backgroundColor = keyBackgroundColor(isSpecial: true)
            shiftKeyButton = button

        case .backspace:
            let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .light)
            button.setImage(UIImage(systemName: "delete.left", withConfiguration: config), for: .normal)
            button.tintColor = .label
            button.backgroundColor = keyBackgroundColor(isSpecial: true)

        case .space:
            button.setTitle("space", for: .normal)
            button.titleLabel?.font = UIFont.systemFont(ofSize: 16)
            button.setTitleColor(.label, for: .normal)
            button.backgroundColor = keyBackgroundColor(isSpecial: false)

        case .returnSend:
            let config = UIImage.SymbolConfiguration(pointSize: 16, weight: .semibold)
            button.setImage(UIImage(systemName: "arrow.up", withConfiguration: config), for: .normal)
            button.tintColor = .white
            button.backgroundColor = .systemBlue

        case .nextKeyboard:
            let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .light)
            button.setImage(UIImage(systemName: "globe", withConfiguration: config), for: .normal)
            button.tintColor = .label
            button.backgroundColor = keyBackgroundColor(isSpecial: true)

        case .toggleNumbers:
            button.setTitle(definition.label, for: .normal)
            button.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .regular)
            button.setTitleColor(.label, for: .normal)
            button.backgroundColor = keyBackgroundColor(isSpecial: true)

        case .period:
            button.setTitle(".", for: .normal)
            button.titleLabel?.font = UIFont.systemFont(ofSize: 16)
            button.setTitleColor(.label, for: .normal)
            button.backgroundColor = keyBackgroundColor(isSpecial: true)
        }

        // Corner radius and shadow (no border per iOS keyboard style)
        button.layer.cornerRadius = 8
        button.layer.cornerCurve = .continuous
        button.layer.shadowColor = UIColor.black.cgColor
        button.layer.shadowOpacity = 0.3
        button.layer.shadowOffset = CGSize(width: 0, height: 1)
        button.layer.shadowRadius = 1

        // Store in keyMap
        keyMap[button] = definition

        // Add targets
        if case .nextKeyboard = definition.type {
            // Globe key uses allTouchEvents for handleInputModeList — handled separately
        } else {
            button.addTarget(self, action: #selector(keyTouchDown(_:)), for: .touchDown)
            button.addTarget(self, action: #selector(keyTapped(_:)), for: .touchUpInside)
            button.addTarget(self, action: #selector(keyTouchCancelled(_:)), for: .touchUpOutside)
            button.addTarget(self, action: #selector(keyTouchCancelled(_:)), for: .touchCancel)
        }

        return button
    }

    private func keyBackgroundColor(isSpecial: Bool) -> UIColor {
        return UIColor(red: 0.235, green: 0.235, blue: 0.235, alpha: 1.0)  // #3C3C3C
    }


    // MARK: - Key Actions

    @objc private func keyTouchDown(_ sender: UIButton) {
        haptic.impactOccurred()

        UIView.animate(withDuration: 0.05) {
            sender.transform = CGAffineTransform(scaleX: 0.95, y: 0.95)
        }

        // Show key preview for character keys
        guard let def = keyMap[sender] else { return }
        if case .character(let c) = def.type {
            let display = (isShifted || isCapsLocked) ? c.uppercased() : c.lowercased()
            keyPreview.show(for: sender, character: display, in: view)
        }
        if case .backspace = def.type {
            backspaceTimer?.invalidate()
            backspaceDeleteCount = 0
            backspaceTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: false) { [weak self] _ in
                self?.scheduleBackspaceRepeat()
            }
        }
    }

    @objc private func keyTapped(_ sender: UIButton) {
        UIView.animate(withDuration: 0.05) {
            sender.transform = .identity
        }

        keyPreview.hide()
        backspaceTimer?.invalidate()
        backspaceTimer = nil

        guard let def = keyMap[sender] else { return }

        switch def.type {
        case .character(let c):
            if isShifted || isCapsLocked {
                promptText.append(c.uppercased())
            } else {
                promptText.append(c.lowercased())
            }
            if isShifted && !isCapsLocked {
                isShifted = false
                updateShiftKeyAppearance()
                updateCharacterKeyLabels()
            }

        case .shift:
            let now = Date()
            if let lastTap = lastShiftTapTime, now.timeIntervalSince(lastTap) < 0.3 {
                // Double-tap: toggle caps lock
                isCapsLocked = !isCapsLocked
                isShifted = isCapsLocked
            } else {
                // Single tap: toggle shift
                isShifted = !isShifted
                isCapsLocked = false
            }
            lastShiftTapTime = now
            updateShiftKeyAppearance()
            updateCharacterKeyLabels()

        case .backspace:
            if !promptText.isEmpty {
                promptText.removeLast()
            }

        case .space:
            promptText.append(" ")

        case .period:
            promptText.append(".")

        case .returnSend:
            onAskClaude()

        case .nextKeyboard:
            // Handled via allTouchEvents -> handleInputModeList
            break

        case .toggleNumbers:
            isNumberMode = !isNumberMode
            buildKeyRows()
            applyAppearance()
        }
    }

    @objc private func keyTouchCancelled(_ sender: UIButton) {
        UIView.animate(withDuration: 0.05) {
            sender.transform = .identity
        }
        keyPreview.hide()
        backspaceTimer?.invalidate()
        backspaceTimer = nil
    }

    private func scheduleBackspaceRepeat() {
        // Accelerate: start at 0.07s, ramp to 0.03s after 20 deletes
        let interval = max(0.03, 0.07 - Double(backspaceDeleteCount) * 0.002)
        backspaceTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            guard let self else { return }
            if !self.promptText.isEmpty {
                self.haptic.impactOccurred()
                self.promptText.removeLast()
                self.backspaceDeleteCount += 1
            }
            self.scheduleBackspaceRepeat()
        }
    }

    // MARK: - Shift Helpers

    private func updateShiftKeyAppearance() {
        guard let shiftButton = shiftKeyButton else { return }
        let symbolName: String
        if isCapsLocked {
            symbolName = "capslock.fill"
        } else if isShifted {
            symbolName = "shift.fill"
        } else {
            symbolName = "shift"
        }
        let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .light)
        shiftButton.setImage(UIImage(systemName: symbolName, withConfiguration: config), for: .normal)
    }

    private func updateCharacterKeyLabels() {
        for (button, def) in keyMap {
            if case .character(let c) = def.type {
                let displayText = (isShifted || isCapsLocked) ? c.uppercased() : c.lowercased()
                button.setTitle(displayText, for: .normal)
            }
        }
    }

    private func updateRow3SendButtonState() {
        let enabled = !promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        row3SendButton?.isEnabled = enabled
        row3SendButton?.alpha = enabled ? 1.0 : 0.4
    }

    private func updatePromptPlaceholderVisibility() {
        if promptText.isEmpty {
            promptField.attributedPlaceholder = NSAttributedString(
                string: "Ask Claude...",
                attributes: [.foregroundColor: UIColor.secondaryLabel]
            )
        } else {
            promptField.attributedPlaceholder = nil
        }
    }

    // MARK: - Mode Transitions

    private func transitionToMode(_ mode: KeyboardMode) {
        switch mode {
        case .input:
            promptRow.isHidden = false
            promptGlow.isHidden = false
            keyboardContainer.isHidden = false
            resultContainer.isHidden = true
            loadingOverlay.isHidden = true
            setAllKeysEnabled(true)

        case .loading:
            promptRow.isHidden = false
            promptGlow.isHidden = false
            keyboardContainer.isHidden = false
            resultContainer.isHidden = true
            loadingOverlay.isHidden = false
            setAllKeysEnabled(false)

        case .result:
            promptRow.isHidden = true
            promptGlow.isHidden = true
            keyboardContainer.isHidden = true
            resultContainer.isHidden = false
            loadingOverlay.isHidden = true
            outputView.text = latestResultText
            resultInsertButton.isEnabled = !latestReply.isEmpty
            resultInsertButton.alpha = resultInsertButton.isEnabled ? 1.0 : 0.5
        }
    }

    private func setAllKeysEnabled(_ enabled: Bool) {
        for (button, _) in keyMap {
            button.isEnabled = enabled
            button.alpha = enabled ? 1.0 : 0.5
        }
        // Re-apply special coloring for send buttons
        if enabled {
            row3SendButton?.alpha = promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.4 : 1.0
        }
    }

    // MARK: - Appearance

    private func applyAppearance() {
        let isDark = traitCollection.userInterfaceStyle == .dark
        let separatorAlpha: CGFloat = isDark ? 0.42 : 0.2
        let keyShadowOpacity: Float = isDark ? 0.7 : 0.3

        view.backgroundColor = .clear

        // Prompt field
        promptField.textColor = .label
        promptField.backgroundColor = .secondarySystemBackground
        updatePromptPlaceholderVisibility()

        // Rotating glow border
        let glowColor = UIColor(red: 1.0, green: 0.6, blue: 0.2, alpha: 1.0)
        promptGlow.updateAppearance(bright: glowColor)

        // Output view
        outputView.backgroundColor = .secondarySystemBackground
        outputView.textColor = .label
        outputView.layer.borderColor = UIColor.separator.withAlphaComponent(separatorAlpha).cgColor

        // Update key colors
        for (button, def) in keyMap {
            button.layer.shadowOpacity = keyShadowOpacity
            switch def.type {
            case .character:
                button.backgroundColor = keyBackgroundColor(isSpecial: false)
                button.setTitleColor(.label, for: .normal)
            case .shift, .backspace, .nextKeyboard, .toggleNumbers, .period:
                button.backgroundColor = keyBackgroundColor(isSpecial: true)
                button.tintColor = .label
                if case .toggleNumbers = def.type {
                    button.setTitleColor(.label, for: .normal)
                }
                if case .period = def.type {
                    button.setTitleColor(.label, for: .normal)
                }
            case .space:
                button.backgroundColor = keyBackgroundColor(isSpecial: false)
                button.setTitleColor(.label, for: .normal)
            case .returnSend:
                button.backgroundColor = .systemBlue
                button.tintColor = .white
            }
        }

        // Key preview
        keyPreview.updateAppearance(fillColor: keyBackgroundColor(isSpecial: false), shadowOpacity: keyShadowOpacity)

        // Result buttons
        if var newPromptConfig = newPromptButton.configuration {
            newPromptConfig.baseBackgroundColor = .systemBlue
            newPromptConfig.baseForegroundColor = .white
            newPromptButton.configuration = newPromptConfig
        }
        if var insertConfig = resultInsertButton.configuration {
            insertConfig.baseBackgroundColor = resultInsertButton.isEnabled ? .systemBlue : .tertiarySystemFill
            insertConfig.baseForegroundColor = resultInsertButton.isEnabled ? .white : .secondaryLabel
            resultInsertButton.configuration = insertConfig
        }
        resultGlobeButton.tintColor = .label
        loadingOverlay.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.82)
        loadingLabel.textColor = .label
    }

    // MARK: - Actions

    @objc private func onNewPrompt() {
        promptText = ""
        latestReply = ""
        latestResultText = ""
        currentMode = .input
    }

    @objc private func onInsert() {
        if latestReply.isEmpty { return }
        textDocumentProxy.insertText(latestReply)
    }

    @objc private func onAskClaude() {
        let trimmed = promptText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return
        }

        // Debug: type "//version" to check system info
        if trimmed == "//version" {
            let ver = ProcessInfo.processInfo.operatingSystemVersion
            let iosVersion = "\(ver.majorVersion).\(ver.minorVersion).\(ver.patchVersion)"
            let fullAccess = hasFullAccess ? "YES" : "NO"
            latestReply = ""
            latestResultText = "iOS \(iosVersion)\nFull Access: \(fullAccess)"
            currentMode = .result
            return
        }

        // Debug: type "//debug" to dump the full payload
        if trimmed == "//debug" {
            let proxy = textDocumentProxy
            let conversationContextPayload: KeyboardConversationContextPayload?
            if #available(iOS 18.4, *) {
                conversationContextPayload = serializeConversationContext(
                    latestConversationContext as? UIConversationContext
                )
            } else {
                conversationContextPayload = nil
            }
            let debugPayload = KeyboardRequestPayload(
                prompt: "(debug)",
                selectedText: proxy.selectedText,
                documentContextBeforeInput: proxy.documentContextBeforeInput,
                documentContextAfterInput: proxy.documentContextAfterInput,
                documentIdentifier: proxy.documentIdentifier.uuidString,
                conversationContext: conversationContextPayload
            )
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let json = (try? encoder.encode(debugPayload)).flatMap { String(data: $0, encoding: .utf8) } ?? "encode failed"
            let contextStatus: String
            if #available(iOS 18.4, *) {
                contextStatus = latestConversationContext != nil ? "captured" : "nil"
            } else {
                contextStatus = "requires iOS 18.4+"
            }
            let log = debugLog.isEmpty ? "(no events)" : debugLog.joined(separator: "\n")
            latestReply = ""
            latestResultText = "Context: \(contextStatus)\n\n--- Event Log ---\n\(log)\n\n--- Payload ---\n\(json)"
            currentMode = .result
            return
        }

        if !hasFullAccess {
            latestReply = ""
            latestResultText = "Full Access is required. Enable it in Settings > Keyboards > Jumper Keyboard."
            outputView.text = latestResultText
            currentMode = .result
            return
        }

        guard let sharedConfig = readSharedConfig() else {
            return
        }
        guard let endpoint = makeKeyboardEndpoint(from: sharedConfig.serverURL) else {
            latestReply = ""
            latestResultText = "Invalid bridge server URL. Open Jumper and reconnect."
            outputView.text = latestResultText
            currentMode = .result
            return
        }

        let proxy = textDocumentProxy
        let conversationContextPayload: KeyboardConversationContextPayload?
        if #available(iOS 18.4, *) {
            conversationContextPayload = serializeConversationContext(
                latestConversationContext as? UIConversationContext
            )
        } else {
            conversationContextPayload = nil
        }

        let payload = KeyboardRequestPayload(
            prompt: trimmed,
            selectedText: proxy.selectedText,
            documentContextBeforeInput: proxy.documentContextBeforeInput,
            documentContextAfterInput: proxy.documentContextAfterInput,
            documentIdentifier: proxy.documentIdentifier.uuidString,
            conversationContext: conversationContextPayload
        )

        guard let body = try? JSONEncoder().encode(payload) else {
            latestReply = ""
            latestResultText = "Failed to encode keyboard payload."
            outputView.text = latestResultText
            currentMode = .result
            return
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        currentMode = .loading

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self else { return }

                if let error {
                    self.latestReply = ""
                    self.latestResultText = "Request failed: \(error.localizedDescription)"
                    self.outputView.text = self.latestResultText
                    self.currentMode = .result
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse else {
                    self.latestReply = ""
                    self.latestResultText = "Invalid response from server."
                    self.outputView.text = self.latestResultText
                    self.currentMode = .result
                    return
                }
                guard let data else {
                    self.latestReply = ""
                    self.latestResultText = "Empty response from server."
                    self.outputView.text = self.latestResultText
                    self.currentMode = .result
                    return
                }

                if (200...299).contains(httpResponse.statusCode) {
                    guard let decoded = try? JSONDecoder().decode(KeyboardResponseSuccess.self, from: data) else {
                        self.latestReply = ""
                        self.latestResultText = "Failed to decode success response."
                        self.outputView.text = self.latestResultText
                        self.currentMode = .result
                        return
                    }
                    self.latestReply = decoded.reply
                    self.latestResultText = decoded.reply
                    self.currentMode = .result
                    return
                }

                let decodedError = (try? JSONDecoder().decode(KeyboardResponseError.self, from: data))?.error
                let errorText = decodedError ?? "Server error (\(httpResponse.statusCode))."
                self.latestReply = ""
                self.latestResultText = errorText
                self.outputView.text = self.latestResultText
                self.currentMode = .result
            }
        }.resume()
    }

    // MARK: - Networking & Config (preserved)

    private func readSharedConfig() -> SharedBridgeConfig? {
        guard let defaults = UserDefaults(suiteName: appGroupSuite) else {
            latestReply = ""
            latestResultText = "App Group storage not available."
            outputView.text = latestResultText
            currentMode = .result
            return nil
        }

        guard let serverURL = defaults.string(forKey: bridgeServerURLKey), !serverURL.isEmpty else {
            latestReply = ""
            latestResultText = "Bridge server URL is missing. Open Jumper and connect first."
            outputView.text = latestResultText
            currentMode = .result
            return nil
        }
        return SharedBridgeConfig(serverURL: serverURL)
    }

    private func makeKeyboardEndpoint(from serverURL: String) -> URL? {
        guard var components = URLComponents(string: serverURL) else {
            return nil
        }
        if components.scheme == "ws" {
            components.scheme = "http"
        } else if components.scheme == "wss" {
            components.scheme = "https"
        }
        components.path = "/keyboard/respond"
        components.query = nil
        components.fragment = nil
        return components.url
    }

    private func captureConversationContext(from textInput: (any UITextInput)?) {
        guard #available(iOS 18.4, *) else {
            return
        }
        guard let textInput else {
            return
        }
        latestConversationContext = textInput.conversationContext ?? nil
    }

    @available(iOS 18.4, *)
    private func serializeConversationContext(
        _ context: UIConversationContext?
    ) -> KeyboardConversationContextPayload? {
        guard let context else {
            return nil
        }

        let entries = context.entries.map { entry in
            KeyboardConversationEntryPayload(
                text: entry.text,
                senderIdentifier: entry.senderIdentifier,
                sentDate: ISO8601DateFormatter().string(from: entry.sentDate),
                entryIdentifier: entry.entryIdentifier,
                replyThreadIdentifier: entry.replyThreadIdentifier,
                primaryRecipientIdentifiers: Array(entry.primaryRecipientIdentifiers)
            )
        }

        let participantNameByIdentifier = context.participantNameByIdentifier.reduce(into: [String: String]()) {
            partialResult, pair in
            let identifier = pair.key
            let displayName = Self.nameFormatter.string(from: pair.value)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if displayName.isEmpty {
                return
            }
            partialResult[identifier] = displayName
        }

        return KeyboardConversationContextPayload(
            threadIdentifier: context.threadIdentifier,
            entries: entries.isEmpty ? nil : entries,
            selfIdentifiers: context.selfIdentifiers.isEmpty ? nil : Array(context.selfIdentifiers),
            responsePrimaryRecipientIdentifiers: context.responsePrimaryRecipientIdentifiers.isEmpty
                ? nil
                : Array(context.responsePrimaryRecipientIdentifiers),
            participantNameByIdentifier: participantNameByIdentifier.isEmpty ? nil : participantNameByIdentifier
        )
    }
}
