import UIKit

private let appGroupSuite = "group.com.ethanwoo.ccbridge"
private let bridgeServerURLKey = "bridge_server_url"
private let bridgeTokenKey = "bridge_token"

private struct SharedBridgeConfig {
    let serverURL: String
    let token: String
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

// MARK: - KeyboardViewController

final class KeyboardViewController: UIInputViewController {

    private static let nameFormatter = PersonNameComponentsFormatter()

    // MARK: State

    private var latestReply = ""
    private var latestResultText = ""
    private var latestConversationContext: AnyObject?
    private var keyboardHeightConstraint: NSLayoutConstraint?

    private var currentMode: KeyboardMode = .input {
        didSet { transitionToMode(currentMode) }
    }

    private var promptText: String = "" {
        didSet {
            promptField.text = promptText.isEmpty ? nil : promptText
            updatePromptPlaceholderVisibility()
            sendButton.isEnabled = !promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            sendButton.alpha = sendButton.isEnabled ? 1.0 : 0.4
            updateRow3SendButtonState()
        }
    }

    private var isShifted: Bool = false
    private var isCapsLocked: Bool = false
    private var isNumberMode: Bool = false
    private var lastShiftTapTime: Date?
    private var backspaceTimer: Timer?
    private var keyMap: [UIButton: KeyDefinition] = [:]

    // MARK: UI References

    private let promptField = UITextField()
    private let sendButton = UIButton(type: .system)
    private let promptRow = UIStackView()
    private let keyboardContainer = UIStackView()
    private let resultContainer = UIStackView()
    private let resultActionRow = UIStackView()
    private let outputView = UITextView()
    private let loadingOverlay = UIView()
    private let loadingLabel = UILabel()
    private let resultGlobeButton = UIButton(type: .system)
    private let newPromptButton = UIButton(type: .system)
    private let resultInsertButton = UIButton(type: .system)

    private var globeKeyInRow3: UIButton?
    private var shiftKeyButton: UIButton?
    private var row3SendButton: UIButton?

    // MARK: Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        Self.nameFormatter.style = .default
        configureHierarchy()
        applyAppearance()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (self: Self, _) in
            self.applyAppearance()
        }
        transitionToMode(currentMode)
    }

    override func updateViewConstraints() {
        if keyboardHeightConstraint == nil {
            let constraint = view.heightAnchor.constraint(equalToConstant: 290)
            constraint.priority = .defaultHigh
            constraint.isActive = true
            keyboardHeightConstraint = constraint
        }
        super.updateViewConstraints()
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        globeKeyInRow3?.isHidden = !needsInputModeSwitchKey
        if currentMode == .result {
            resultGlobeButton.isHidden = !needsInputModeSwitchKey
        }
    }

    override func textDidChange(_ textInput: (any UITextInput)?) {
        captureConversationContext(from: textInput)
    }

    @available(iOS 18.4, *)
    override func conversationContext(_ context: UIConversationContext?, didChange textInput: (any UITextInput)?) {
        latestConversationContext = context
    }

    // MARK: - Hierarchy Setup

    private func configureHierarchy() {
        view.backgroundColor = .systemBackground

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

        view.addSubview(promptRow)
        view.addSubview(keyboardContainer)
        view.addSubview(resultContainer)
        view.addSubview(loadingOverlay)

        NSLayoutConstraint.activate([
            // Prompt row: top with 12px padding, sides with 3px
            promptRow.topAnchor.constraint(equalTo: view.topAnchor, constant: 12),
            promptRow.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 3),
            promptRow.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -3),
            promptRow.heightAnchor.constraint(equalToConstant: 34),

            // Keyboard container: below prompt row with 4px spacing
            keyboardContainer.topAnchor.constraint(equalTo: promptRow.bottomAnchor, constant: 4),
            keyboardContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 3),
            keyboardContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -3),
            keyboardContainer.heightAnchor.constraint(equalToConstant: 234),

            // Result container: same position as keyboard container
            resultContainer.topAnchor.constraint(equalTo: promptRow.bottomAnchor, constant: 4),
            resultContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 3),
            resultContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -3),
            resultContainer.heightAnchor.constraint(equalToConstant: 234),

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
        promptField.layer.cornerRadius = 10
        promptField.layer.cornerCurve = .continuous
        promptField.layer.borderWidth = 1
        promptField.font = UIFont.systemFont(ofSize: 15)
        promptField.leftViewMode = .always
        promptField.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 10, height: 1))
        promptField.rightViewMode = .always
        promptField.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 10, height: 1))

        // Send button
        let sendConfig = UIImage.SymbolConfiguration(pointSize: 16, weight: .semibold)
        let sendImage = UIImage(systemName: "arrow.up", withConfiguration: sendConfig)
        sendButton.setImage(sendImage, for: .normal)
        sendButton.tintColor = .white
        sendButton.backgroundColor = .systemBlue
        sendButton.layer.cornerRadius = 17
        sendButton.layer.cornerCurve = .continuous
        sendButton.layer.borderWidth = 0.5
        sendButton.translatesAutoresizingMaskIntoConstraints = false
        sendButton.isEnabled = false
        sendButton.alpha = 0.4
        sendButton.addTarget(self, action: #selector(onAskClaude), for: .touchUpInside)

        NSLayoutConstraint.activate([
            sendButton.widthAnchor.constraint(equalToConstant: 34),
            sendButton.heightAnchor.constraint(equalToConstant: 34),
        ])

        promptRow.addArrangedSubview(promptField)
        promptRow.addArrangedSubview(sendButton)
    }

    private func configureKeyboardContainer() {
        keyboardContainer.axis = .vertical
        keyboardContainer.alignment = .fill
        keyboardContainer.distribution = .fill
        keyboardContainer.spacing = 6
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
        globeKeyInRow3 = nil
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

        // Row 1: A S D F G H J K L (centered with spacers)
        let row1Keys: [KeyDefinition] = "ASDFGHJKL".map {
            KeyDefinition(type: .character(String($0)), label: String($0), widthMultiplier: 1.0)
        }
        let row1 = makeKeyRow(keys: row1Keys, rowIndex: 1, centered: true)
        keyboardContainer.addArrangedSubview(row1)

        // Row 2: Shift Z X C V B N M Backspace
        var row2Keys: [KeyDefinition] = []
        row2Keys.append(KeyDefinition(type: .shift, label: "shift", widthMultiplier: 1.5))
        for c in "ZXCVBNM" {
            row2Keys.append(KeyDefinition(type: .character(String(c)), label: String(c), widthMultiplier: 1.0))
        }
        row2Keys.append(KeyDefinition(type: .backspace, label: "delete.left", widthMultiplier: 1.5))
        let row2 = makeKeyRow(keys: row2Keys, rowIndex: 2)
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
        // Row 3: [123/ABC 1.5x] [globe 1x] [space flexible] [. 1x] [send 1.5x]
        let row3 = UIStackView()
        row3.axis = .horizontal
        row3.alignment = .fill
        row3.distribution = .fill
        row3.spacing = 4
        row3.translatesAutoresizingMaskIntoConstraints = false

        let baseWidth = calculateBaseKeyWidth()

        // 123/ABC toggle key
        let toggleLabel = isNumberMode ? "ABC" : "123"
        let toggleDef = KeyDefinition(type: .toggleNumbers, label: toggleLabel, widthMultiplier: 1.5)
        let toggleButton = makeKeyButton(definition: toggleDef, baseWidth: baseWidth, isSpecial: true)
        row3.addArrangedSubview(toggleButton)

        // Globe key
        let globeDef = KeyDefinition(type: .nextKeyboard, label: "globe", widthMultiplier: 1.0)
        let globeButton = makeKeyButton(definition: globeDef, baseWidth: baseWidth, isSpecial: true)
        globeButton.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        // Remove the standard touchUpInside target we added in makeKeyButton for nextKeyboard
        globeKeyInRow3 = globeButton
        row3.addArrangedSubview(globeButton)

        // Space bar (flexible)
        let spaceDef = KeyDefinition(type: .space, label: "space", widthMultiplier: 1.0)
        let spaceButton = UIButton(type: .system)
        spaceButton.setTitle("space", for: .normal)
        spaceButton.titleLabel?.font = UIFont.systemFont(ofSize: 15)
        spaceButton.setTitleColor(.label, for: .normal)
        spaceButton.backgroundColor = keyBackgroundColor(isSpecial: false)
        spaceButton.layer.cornerRadius = 5
        spaceButton.layer.cornerCurve = .continuous
        spaceButton.layer.borderWidth = 0.5
        spaceButton.layer.shadowColor = UIColor.black.cgColor
        spaceButton.layer.shadowOpacity = 0.2
        spaceButton.layer.shadowOffset = CGSize(width: 0, height: 1)
        spaceButton.layer.shadowRadius = 0.5
        keyMap[spaceButton] = spaceDef
        spaceButton.addTarget(self, action: #selector(keyTouchDown(_:)), for: .touchDown)
        spaceButton.addTarget(self, action: #selector(keyTapped(_:)), for: .touchUpInside)
        spaceButton.addTarget(self, action: #selector(keyTouchCancelled(_:)), for: .touchUpOutside)
        spaceButton.addTarget(self, action: #selector(keyTouchCancelled(_:)), for: .touchCancel)
        spaceButton.setContentHuggingPriority(.defaultLow, for: .horizontal)
        spaceButton.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        row3.addArrangedSubview(spaceButton)

        // Period key
        let periodDef = KeyDefinition(type: .period, label: ".", widthMultiplier: 1.0)
        let periodButton = makeKeyButton(definition: periodDef, baseWidth: baseWidth, isSpecial: true)
        row3.addArrangedSubview(periodButton)

        // Send key (arrow.up)
        let sendDef = KeyDefinition(type: .returnSend, label: "arrow.up", widthMultiplier: 1.5)
        let row3Send = UIButton(type: .system)
        let sendConfig = UIImage.SymbolConfiguration(pointSize: 16, weight: .semibold)
        let sendImage = UIImage(systemName: "arrow.up", withConfiguration: sendConfig)
        row3Send.setImage(sendImage, for: .normal)
        row3Send.tintColor = .white
        row3Send.backgroundColor = .systemBlue
        row3Send.layer.cornerRadius = 5
        row3Send.layer.cornerCurve = .continuous
        row3Send.layer.borderWidth = 0.5
        row3Send.translatesAutoresizingMaskIntoConstraints = false
        let sendWidth = baseWidth * 1.5
        row3Send.widthAnchor.constraint(equalToConstant: sendWidth).isActive = true
        keyMap[row3Send] = sendDef
        row3Send.addTarget(self, action: #selector(keyTouchDown(_:)), for: .touchDown)
        row3Send.addTarget(self, action: #selector(keyTapped(_:)), for: .touchUpInside)
        row3Send.addTarget(self, action: #selector(keyTouchCancelled(_:)), for: .touchUpOutside)
        row3Send.addTarget(self, action: #selector(keyTouchCancelled(_:)), for: .touchCancel)
        row3Send.isEnabled = !promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        row3Send.alpha = row3Send.isEnabled ? 1.0 : 0.4
        row3SendButton = row3Send
        row3.addArrangedSubview(row3Send)

        // Row height
        row3.heightAnchor.constraint(equalToConstant: 46).isActive = true

        keyboardContainer.addArrangedSubview(row3)
    }

    // MARK: - Key Row Factory

    private func makeKeyRow(keys: [KeyDefinition], rowIndex: Int, centered: Bool = false) -> UIStackView {
        let row = UIStackView()
        row.axis = .horizontal
        row.alignment = .fill
        row.distribution = .fill
        row.spacing = 4
        row.translatesAutoresizingMaskIntoConstraints = false

        let baseWidth = calculateBaseKeyWidth()

        if centered {
            // Add leading flexible spacer
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
            let button = makeKeyButton(definition: keyDef, baseWidth: baseWidth, isSpecial: isSpecial)
            row.addArrangedSubview(button)
        }

        if centered {
            // Add trailing flexible spacer
            let trailingSpacer = UIView()
            trailingSpacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
            trailingSpacer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            row.addArrangedSubview(trailingSpacer)

            // Make spacers equal width
            if let leading = row.arrangedSubviews.first, let trailing = row.arrangedSubviews.last {
                trailing.widthAnchor.constraint(equalTo: leading.widthAnchor).isActive = true
            }
        }

        row.heightAnchor.constraint(equalToConstant: 46).isActive = true
        return row
    }

    private func makeKeyButton(definition: KeyDefinition, baseWidth: CGFloat, isSpecial: Bool) -> UIButton {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false

        // Configure appearance based on type
        switch definition.type {
        case .character:
            button.setTitle(isShifted || isCapsLocked ? definition.label.uppercased() : definition.label.lowercased(), for: .normal)
            button.titleLabel?.font = UIFont.systemFont(ofSize: 22)
            button.setTitleColor(.label, for: .normal)
            button.backgroundColor = keyBackgroundColor(isSpecial: false)

        case .shift:
            let symbolName: String
            if isCapsLocked {
                symbolName = "capslock.fill"
            } else if isShifted {
                symbolName = "shift.fill"
            } else {
                symbolName = "shift"
            }
            let config = UIImage.SymbolConfiguration(pointSize: 16, weight: .medium)
            button.setImage(UIImage(systemName: symbolName, withConfiguration: config), for: .normal)
            button.tintColor = .label
            button.backgroundColor = keyBackgroundColor(isSpecial: true)
            shiftKeyButton = button

        case .backspace:
            let config = UIImage.SymbolConfiguration(pointSize: 16, weight: .medium)
            button.setImage(UIImage(systemName: "delete.left", withConfiguration: config), for: .normal)
            button.tintColor = .label
            button.backgroundColor = keyBackgroundColor(isSpecial: true)

        case .space:
            button.setTitle("space", for: .normal)
            button.titleLabel?.font = UIFont.systemFont(ofSize: 15)
            button.setTitleColor(.label, for: .normal)
            button.backgroundColor = keyBackgroundColor(isSpecial: false)

        case .returnSend:
            let config = UIImage.SymbolConfiguration(pointSize: 16, weight: .semibold)
            button.setImage(UIImage(systemName: "arrow.up", withConfiguration: config), for: .normal)
            button.tintColor = .white
            button.backgroundColor = .systemBlue

        case .nextKeyboard:
            let config = UIImage.SymbolConfiguration(pointSize: 16, weight: .regular)
            button.setImage(UIImage(systemName: "globe", withConfiguration: config), for: .normal)
            button.tintColor = .label
            button.backgroundColor = keyBackgroundColor(isSpecial: true)

        case .toggleNumbers:
            button.setTitle(definition.label, for: .normal)
            button.titleLabel?.font = UIFont.systemFont(ofSize: 15, weight: .regular)
            button.setTitleColor(.label, for: .normal)
            button.backgroundColor = keyBackgroundColor(isSpecial: true)

        case .period:
            button.setTitle(".", for: .normal)
            button.titleLabel?.font = UIFont.systemFont(ofSize: 22)
            button.setTitleColor(.label, for: .normal)
            button.backgroundColor = keyBackgroundColor(isSpecial: true)
        }

        // Corner radius and shadow
        button.layer.cornerRadius = 5
        button.layer.cornerCurve = .continuous
        button.layer.borderWidth = 0.5
        button.layer.shadowColor = UIColor.black.cgColor
        button.layer.shadowOpacity = 0.2
        button.layer.shadowOffset = CGSize(width: 0, height: 1)
        button.layer.shadowRadius = 0.5

        // Width constraint
        let width = baseWidth * definition.widthMultiplier
        let widthConstraint = button.widthAnchor.constraint(equalToConstant: width)
        widthConstraint.priority = UILayoutPriority(999)
        widthConstraint.isActive = true

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

    private func calculateBaseKeyWidth() -> CGFloat {
        let containerWidth = view.bounds.width - 6 // 3px padding on each side
        let keySpacing: CGFloat = 4.0
        let baseWidth = (containerWidth - (9 * keySpacing)) / 10.0
        return max(baseWidth, 20) // minimum safety
    }

    private func keyBackgroundColor(isSpecial: Bool) -> UIColor {
        let isDark = traitCollection.userInterfaceStyle == .dark
        if isDark {
            return isSpecial
                ? UIColor(red: 0.32, green: 0.34, blue: 0.39, alpha: 1.0)
                : UIColor(red: 0.41, green: 0.43, blue: 0.47, alpha: 1.0)
        }
        return isSpecial
            ? UIColor(red: 0.69, green: 0.71, blue: 0.75, alpha: 1.0)
            : .white
    }

    private func keyBorderColor() -> UIColor {
        let isDark = traitCollection.userInterfaceStyle == .dark
        return isDark
            ? UIColor(white: 1.0, alpha: 0.14)
            : UIColor(white: 0.0, alpha: 0.12)
    }

    private func keyboardSurfaceColor() -> UIColor {
        let isDark = traitCollection.userInterfaceStyle == .dark
        return isDark
            ? UIColor(red: 0.17, green: 0.18, blue: 0.20, alpha: 1.0)
            : UIColor(red: 0.82, green: 0.84, blue: 0.87, alpha: 1.0)
    }

    // MARK: - Key Actions

    @objc private func keyTouchDown(_ sender: UIButton) {
        UIView.animate(withDuration: 0.05) {
            sender.transform = CGAffineTransform(scaleX: 0.95, y: 0.95)
        }

        // Start backspace repeat timer
        guard let def = keyMap[sender] else { return }
        if case .backspace = def.type {
            backspaceTimer?.invalidate()
            backspaceTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: false) { [weak self] _ in
                self?.backspaceTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                    guard let self else { return }
                    if !self.promptText.isEmpty {
                        self.promptText.removeLast()
                    }
                }
            }
        }
    }

    @objc private func keyTapped(_ sender: UIButton) {
        UIView.animate(withDuration: 0.05) {
            sender.transform = .identity
        }

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
        backspaceTimer?.invalidate()
        backspaceTimer = nil
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
        let config = UIImage.SymbolConfiguration(pointSize: 16, weight: .medium)
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
            keyboardContainer.isHidden = false
            resultContainer.isHidden = true
            loadingOverlay.isHidden = true
            sendButton.isEnabled = !promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            sendButton.alpha = sendButton.isEnabled ? 1.0 : 0.4
            setAllKeysEnabled(true)

        case .loading:
            promptRow.isHidden = false
            keyboardContainer.isHidden = false
            resultContainer.isHidden = true
            loadingOverlay.isHidden = false
            sendButton.isEnabled = false
            sendButton.alpha = 0.4
            setAllKeysEnabled(false)

        case .result:
            promptRow.isHidden = true
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
        let keyShadowOpacity: Float = isDark ? 0.0 : 0.18

        view.backgroundColor = keyboardSurfaceColor()

        // Prompt field
        promptField.textColor = .label
        promptField.backgroundColor = .secondarySystemBackground
        promptField.layer.borderColor = UIColor.separator.withAlphaComponent(separatorAlpha).cgColor
        updatePromptPlaceholderVisibility()

        // Output view
        outputView.backgroundColor = .secondarySystemBackground
        outputView.textColor = .label
        outputView.layer.borderColor = UIColor.separator.withAlphaComponent(separatorAlpha).cgColor

        // Update key colors
        for (button, def) in keyMap {
            button.layer.borderColor = keyBorderColor().cgColor
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

        // Loading overlay
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
        sendButton.layer.borderColor = keyBorderColor().cgColor
        row3SendButton?.layer.borderColor = keyBorderColor().cgColor
        loadingOverlay.backgroundColor = keyboardSurfaceColor().withAlphaComponent(0.82)
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

        if !hasFullAccess {
            latestReply = ""
            latestResultText = "Full Access is required. Enable it in Settings > Keyboards > cc-bridge Keyboard."
            outputView.text = latestResultText
            currentMode = .result
            return
        }

        guard let sharedConfig = readSharedConfig() else {
            return
        }
        guard let endpoint = makeKeyboardEndpoint(from: sharedConfig.serverURL) else {
            latestReply = ""
            latestResultText = "Invalid bridge server URL. Open cc-bridge app and reconnect."
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
        request.setValue("Bearer \(sharedConfig.token)", forHTTPHeaderField: "Authorization")
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
            latestResultText = "Bridge server URL is missing. Open cc-bridge app and connect first."
            outputView.text = latestResultText
            currentMode = .result
            return nil
        }
        guard let token = defaults.string(forKey: bridgeTokenKey), !token.isEmpty else {
            latestReply = ""
            latestResultText = "Bridge token is missing. Pair from the cc-bridge app first."
            outputView.text = latestResultText
            currentMode = .result
            return nil
        }
        return SharedBridgeConfig(serverURL: serverURL, token: token)
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
