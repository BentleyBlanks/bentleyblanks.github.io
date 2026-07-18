/**
 * Manual, serverless WebRTC signaling for Frontier Drop.
 *
 * Signaling codes contain SDP and can expose local network addresses. Only
 * exchange them with players you trust. No network work is performed when this
 * module is imported, so the codec helpers are also safe to use from Node.
 */

export const signalingCodeVersion = 1;
export const signalingCodePrefix = "FD1.";
export const dataChannelLabel = "FrontierDropGame";

const maximumDescriptionLength = 1_500_000;
const maximumSignalingCodeLength = 2_100_000;
const defaultIceGatheringTimeoutMs = 15_000;

export class NetworkModuleError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code ?? "NETWORK_ERROR";

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class SignalingCodeError extends NetworkModuleError {}

export class WebRtcUnavailableError extends NetworkModuleError {}

export class NetworkStateError extends NetworkModuleError {}

function CreateSignalingCodeError(message, code = "INVALID_SIGNALING_CODE", cause) {
  return new SignalingCodeError(message, { code, cause });
}

function NormalizeDescription(description, expectedType = null) {
  if (description === null || typeof description !== "object") {
    throw CreateSignalingCodeError("The signaling description must be an object.");
  }

  const type = description.type;
  const sdp = description.sdp;

  if (type !== "offer" && type !== "answer") {
    throw CreateSignalingCodeError(
      "The signaling description type must be offer or answer.",
      "INVALID_SIGNALING_TYPE",
    );
  }

  if (expectedType !== null && type !== expectedType) {
    throw CreateSignalingCodeError(
      `Expected a ${expectedType} signaling code but received ${type}.`,
      "UNEXPECTED_SIGNALING_TYPE",
    );
  }

  if (typeof sdp !== "string" || sdp.length === 0) {
    throw CreateSignalingCodeError(
      "The signaling description does not contain SDP data.",
      "INVALID_SIGNALING_SDP",
    );
  }

  if (sdp.length > maximumDescriptionLength) {
    throw CreateSignalingCodeError(
      "The signaling description is too large.",
      "SIGNALING_CODE_TOO_LARGE",
    );
  }

  return { type, sdp };
}

function EncodeUtf8(value) {
  if (typeof globalThis.TextEncoder === "function") {
    return new globalThis.TextEncoder().encode(value);
  }

  const bufferConstructor = globalThis.Buffer;
  if (typeof bufferConstructor?.from === "function") {
    return Uint8Array.from(bufferConstructor.from(value, "utf8"));
  }

  throw new NetworkModuleError("UTF-8 encoding is unavailable in this environment.", {
    code: "CODEC_UNAVAILABLE",
  });
}

function DecodeUtf8(bytes) {
  if (typeof globalThis.TextDecoder === "function") {
    return new globalThis.TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  const bufferConstructor = globalThis.Buffer;
  if (typeof bufferConstructor?.from === "function") {
    return bufferConstructor.from(bytes).toString("utf8");
  }

  throw new NetworkModuleError("UTF-8 decoding is unavailable in this environment.", {
    code: "CODEC_UNAVAILABLE",
  });
}

function EncodeBase64(bytes) {
  const bufferConstructor = globalThis.Buffer;
  if (typeof bufferConstructor?.from === "function") {
    return bufferConstructor.from(bytes).toString("base64");
  }

  if (typeof globalThis.btoa !== "function") {
    throw new NetworkModuleError("Base64 encoding is unavailable in this environment.", {
      code: "CODEC_UNAVAILABLE",
    });
  }

  let binaryValue = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binaryValue += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return globalThis.btoa(binaryValue);
}

function DecodeBase64(value) {
  const bufferConstructor = globalThis.Buffer;
  if (typeof bufferConstructor?.from === "function") {
    return Uint8Array.from(bufferConstructor.from(value, "base64"));
  }

  if (typeof globalThis.atob !== "function") {
    throw new NetworkModuleError("Base64 decoding is unavailable in this environment.", {
      code: "CODEC_UNAVAILABLE",
    });
  }

  const binaryValue = globalThis.atob(value);
  const bytes = new Uint8Array(binaryValue.length);
  for (let index = 0; index < binaryValue.length; index += 1) {
    bytes[index] = binaryValue.charCodeAt(index);
  }

  return bytes;
}

function EncodeBase64Url(value) {
  return EncodeBase64(EncodeUtf8(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function DecodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw CreateSignalingCodeError("The signaling code contains invalid characters.");
  }

  const paddingLength = (4 - (value.length % 4)) % 4;
  const paddedValue = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(paddingLength);
  const bytes = DecodeBase64(paddedValue);
  const canonicalValue = EncodeBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

  if (canonicalValue !== value) {
    throw CreateSignalingCodeError("The signaling code is not canonical Base64URL data.");
  }

  return DecodeUtf8(bytes);
}

/**
 * Encode an RTCSessionDescriptionInit-like object as a copyable signaling code.
 */
export function EncodeSignalingCode(description) {
  const normalizedDescription = NormalizeDescription(description);
  const payload = JSON.stringify({
    v: signalingCodeVersion,
    t: normalizedDescription.type,
    s: normalizedDescription.sdp,
  });

  return `${signalingCodePrefix}${EncodeBase64Url(payload)}`;
}

/**
 * Decode and validate a signaling code. expectedType may be "offer" or "answer".
 */
export function DecodeSignalingCode(code, expectedType = null) {
  try {
    if (typeof code !== "string") {
      throw CreateSignalingCodeError("The signaling code must be text.");
    }

    const normalizedCode = code.trim();
    if (normalizedCode.length === 0) {
      throw CreateSignalingCodeError("The signaling code is empty.");
    }

    if (normalizedCode.length > maximumSignalingCodeLength) {
      throw CreateSignalingCodeError(
        "The signaling code is too large.",
        "SIGNALING_CODE_TOO_LARGE",
      );
    }

    if (!normalizedCode.startsWith(signalingCodePrefix)) {
      throw CreateSignalingCodeError(
        "The signaling code has an unsupported prefix or version.",
        "UNSUPPORTED_SIGNALING_VERSION",
      );
    }

    if (expectedType !== null && expectedType !== "offer" && expectedType !== "answer") {
      throw CreateSignalingCodeError(
        "The expected signaling type must be offer or answer.",
        "INVALID_EXPECTED_SIGNALING_TYPE",
      );
    }

    const encodedPayload = normalizedCode.slice(signalingCodePrefix.length);
    if (encodedPayload.length === 0) {
      throw CreateSignalingCodeError("The signaling code has no payload.");
    }

    const serializedPayload = DecodeBase64Url(encodedPayload);
    let payload;
    try {
      payload = JSON.parse(serializedPayload);
    } catch (error) {
      throw CreateSignalingCodeError("The signaling code payload is not valid JSON.", undefined, error);
    }

    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw CreateSignalingCodeError("The signaling code payload must be an object.");
    }

    if (payload.v !== signalingCodeVersion) {
      throw CreateSignalingCodeError(
        "The signaling code version is not supported.",
        "UNSUPPORTED_SIGNALING_VERSION",
      );
    }

    return NormalizeDescription({ type: payload.t, sdp: payload.s }, expectedType);
  } catch (error) {
    if (error instanceof SignalingCodeError || error instanceof NetworkModuleError) {
      throw error;
    }

    throw CreateSignalingCodeError("The signaling code could not be decoded.", undefined, error);
  }
}

/**
 * Non-throwing companion to DecodeSignalingCode.
 */
export function TryDecodeSignalingCode(code, expectedType = null) {
  try {
    return { ok: true, description: DecodeSignalingCode(code, expectedType) };
  } catch (error) {
    return { ok: false, error };
  }
}

function NormalizeNetworkError(error, message, code = "NETWORK_OPERATION_FAILED") {
  if (error instanceof NetworkModuleError) {
    return error;
  }

  const errorMessage = typeof error?.message === "string" ? error.message : String(error);
  return new NetworkModuleError(`${message}: ${errorMessage}`, { code, cause: error });
}

function WaitForIceGatheringComplete(peerConnection, timeoutMs) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let finished = false;
    let timeoutId = null;

    const Cleanup = () => {
      peerConnection.removeEventListener("icegatheringstatechange", HandleGatheringStateChange);
      peerConnection.removeEventListener("icecandidate", HandleIceCandidate);
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };

    const Finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      Cleanup();
      resolve();
    };

    const Fail = () => {
      if (finished) {
        return;
      }

      finished = true;
      Cleanup();
      reject(
        new NetworkModuleError("ICE candidate gathering timed out.", {
          code: "ICE_GATHERING_TIMEOUT",
        }),
      );
    };

    function HandleGatheringStateChange() {
      if (peerConnection.iceGatheringState === "complete") {
        Finish();
      }
    }

    function HandleIceCandidate(event) {
      if (event.candidate === null) {
        Finish();
      }
    }

    peerConnection.addEventListener("icegatheringstatechange", HandleGatheringStateChange);
    peerConnection.addEventListener("icecandidate", HandleIceCandidate);
    timeoutId = globalThis.setTimeout(Fail, timeoutMs);
    HandleGatheringStateChange();
  });
}

export class ManualLanConnection {
  constructor(options = {}) {
    if (options === null || typeof options !== "object") {
      throw new NetworkModuleError("Network options must be an object.", {
        code: "INVALID_NETWORK_OPTIONS",
      });
    }

    const timeoutMs = options.iceGatheringTimeoutMs ?? defaultIceGatheringTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new NetworkModuleError("iceGatheringTimeoutMs must be a positive number.", {
        code: "INVALID_NETWORK_OPTIONS",
      });
    }

    this.rtcConfiguration = options.rtcConfiguration ?? { iceServers: [] };
    this.iceGatheringTimeoutMs = timeoutMs;
    this.peerConnectionConstructor = options.peerConnectionConstructor ?? null;
    this.onStatus = typeof options.onStatus === "function" ? options.onStatus : null;
    this.onMessage = typeof options.onMessage === "function" ? options.onMessage : null;
    this.onOpen = typeof options.onOpen === "function" ? options.onOpen : null;
    this.onClose = typeof options.onClose === "function" ? options.onClose : null;

    this.peerConnection = null;
    this.dataChannel = null;
    this.role = "none";
    this.state = "idle";
    this.connectionVersion = 0;
    this.closeNotifiedVersion = -1;
  }

  SetCallbacks(callbacks = {}) {
    if (callbacks === null || typeof callbacks !== "object") {
      return false;
    }

    for (const callbackName of ["onStatus", "onMessage", "onOpen", "onClose"]) {
      if (Object.hasOwn(callbacks, callbackName)) {
        this[callbackName] = typeof callbacks[callbackName] === "function" ? callbacks[callbackName] : null;
      }
    }

    return true;
  }

  GetState() {
    return {
      role: this.role,
      state: this.state,
      isOpen: this.IsOpen(),
      connectionState: this.peerConnection?.connectionState ?? "closed",
      iceConnectionState: this.peerConnection?.iceConnectionState ?? "closed",
      signalingState: this.peerConnection?.signalingState ?? "closed",
      dataChannelState: this.dataChannel?.readyState ?? "closed",
    };
  }

  GetPeerConnection() {
    return this.peerConnection;
  }

  GetDataChannel() {
    return this.dataChannel;
  }

  IsOpen() {
    return this.dataChannel?.readyState === "open";
  }

  EmitStatus(state, message = "", error = null) {
    this.state = state;
    this.InvokeCallback(this.onStatus, {
      ...this.GetState(),
      state,
      message,
      error,
    });
  }

  InvokeCallback(callback, ...argumentsList) {
    if (typeof callback !== "function") {
      return;
    }

    try {
      callback(...argumentsList);
    } catch {
      // UI callback failures must never break the WebRTC state machine.
    }
  }

  ResolvePeerConnectionConstructor() {
    const peerConnectionConstructor =
      this.peerConnectionConstructor ?? globalThis.RTCPeerConnection;

    if (typeof peerConnectionConstructor !== "function") {
      throw new WebRtcUnavailableError(
        "WebRTC is unavailable. Use a current browser on HTTPS or localhost.",
        { code: "WEBRTC_UNAVAILABLE" },
      );
    }

    return peerConnectionConstructor;
  }

  PreparePeer(role) {
    if (this.peerConnection !== null || this.dataChannel !== null) {
      this.DisposeCurrentConnection("replaced", true);
    } else {
      this.connectionVersion += 1;
    }

    const peerConnectionConstructor = this.ResolvePeerConnectionConstructor();
    let peerConnection;
    try {
      peerConnection = new peerConnectionConstructor(this.rtcConfiguration);
    } catch (error) {
      throw NormalizeNetworkError(error, "Could not create the WebRTC connection", "PEER_CREATION_FAILED");
    }

    this.peerConnection = peerConnection;
    this.dataChannel = null;
    this.role = role;
    this.state = "idle";
    const connectionVersion = this.connectionVersion;
    this.BindPeerConnection(peerConnection, connectionVersion);
    return { peerConnection, connectionVersion };
  }

  BindPeerConnection(peerConnection, connectionVersion) {
    peerConnection.ondatachannel = (event) => {
      if (!this.IsCurrentConnection(peerConnection, connectionVersion)) {
        this.CloseUnexpectedChannel(event.channel);
        return;
      }

      if (this.dataChannel !== null && this.dataChannel !== event.channel) {
        this.CloseUnexpectedChannel(event.channel);
        this.EmitStatus(
          "channelError",
          "An unexpected extra data channel was rejected.",
          new NetworkStateError("Only one game data channel is supported.", {
            code: "UNEXPECTED_DATA_CHANNEL",
          }),
        );
        return;
      }

      this.BindDataChannel(event.channel, connectionVersion);
    };

    peerConnection.onconnectionstatechange = () => {
      if (!this.IsCurrentConnection(peerConnection, connectionVersion)) {
        return;
      }

      const connectionState = peerConnection.connectionState;
      if (connectionState === "failed") {
        this.EmitStatus(
          "error",
          "The peer connection failed.",
          new NetworkStateError("The peer connection failed.", {
            code: "PEER_CONNECTION_FAILED",
          }),
        );
      } else if (connectionState === "closed") {
        this.NotifyClosed(connectionVersion, "peerConnectionClosed", null);
      } else {
        this.EmitStatus("connectionState", `Peer connection state: ${connectionState}.`);
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (!this.IsCurrentConnection(peerConnection, connectionVersion)) {
        return;
      }

      const iceState = peerConnection.iceConnectionState;
      if (iceState === "failed") {
        this.EmitStatus(
          "error",
          "The LAN path could not be established.",
          new NetworkStateError("ICE connectivity failed.", { code: "ICE_CONNECTION_FAILED" }),
        );
      } else if (iceState === "disconnected") {
        this.EmitStatus("connectionState", "The peer is temporarily disconnected.");
      }
    };

    peerConnection.onicecandidateerror = (event) => {
      if (!this.IsCurrentConnection(peerConnection, connectionVersion)) {
        return;
      }

      const errorText = event.errorText || "An ICE candidate could not be gathered.";
      this.EmitStatus(
        "iceCandidateError",
        errorText,
        new NetworkModuleError(errorText, { code: "ICE_CANDIDATE_ERROR" }),
      );
    };
  }

  BindDataChannel(dataChannel, connectionVersion) {
    this.dataChannel = dataChannel;

    try {
      dataChannel.binaryType = "arraybuffer";
    } catch {
      // Some test doubles expose binaryType as read-only; delivery still works.
    }

    dataChannel.onopen = (event) => {
      if (!this.IsCurrentDataChannel(dataChannel, connectionVersion)) {
        return;
      }

      this.EmitStatus("open", "LAN data channel opened.");
      this.InvokeCallback(this.onOpen, {
        role: this.role,
        channel: dataChannel,
        event,
      });
    };

    dataChannel.onmessage = (event) => {
      if (!this.IsCurrentDataChannel(dataChannel, connectionVersion)) {
        return;
      }

      this.InvokeCallback(this.onMessage, event.data, event);
    };

    dataChannel.onclosing = () => {
      if (this.IsCurrentDataChannel(dataChannel, connectionVersion)) {
        this.EmitStatus("closing", "LAN data channel is closing.");
      }
    };

    dataChannel.onclose = (event) => {
      if (this.IsCurrentDataChannel(dataChannel, connectionVersion)) {
        this.NotifyClosed(connectionVersion, "dataChannelClosed", event);
      }
    };

    dataChannel.onerror = (event) => {
      if (!this.IsCurrentDataChannel(dataChannel, connectionVersion)) {
        return;
      }

      const error = NormalizeNetworkError(event.error ?? event, "The data channel reported an error", "DATA_CHANNEL_ERROR");
      this.EmitStatus("channelError", error.message, error);
    };
  }

  CloseUnexpectedChannel(dataChannel) {
    try {
      dataChannel.close();
    } catch {
      // The channel may already be closed.
    }
  }

  IsCurrentConnection(peerConnection, connectionVersion) {
    return this.peerConnection === peerConnection && this.connectionVersion === connectionVersion;
  }

  IsCurrentDataChannel(dataChannel, connectionVersion) {
    return this.dataChannel === dataChannel && this.connectionVersion === connectionVersion;
  }

  EnsureCurrentConnection(peerConnection, connectionVersion) {
    if (!this.IsCurrentConnection(peerConnection, connectionVersion)) {
      throw new NetworkStateError("The connection operation was cancelled.", {
        code: "CONNECTION_CANCELLED",
      });
    }
  }

  NotifyClosed(connectionVersion, reason, event, closedRole = this.role) {
    if (this.closeNotifiedVersion === connectionVersion) {
      return;
    }

    this.closeNotifiedVersion = connectionVersion;
    if (this.connectionVersion === connectionVersion) {
      this.EmitStatus("closed", `LAN connection closed: ${reason}.`);
    } else {
      this.InvokeCallback(this.onStatus, {
        role: closedRole,
        state: "closed",
        isOpen: false,
        connectionState: "closed",
        iceConnectionState: "closed",
        signalingState: "closed",
        dataChannelState: "closed",
        message: `LAN connection closed: ${reason}.`,
        error: null,
      });
    }

    this.InvokeCallback(this.onClose, {
      role: closedRole,
      reason,
      event,
    });
  }

  DisposeCurrentConnection(reason, notifyClose) {
    const peerConnection = this.peerConnection;
    const dataChannel = this.dataChannel;
    const connectionVersion = this.connectionVersion;
    const closedRole = this.role;

    if (dataChannel !== null) {
      dataChannel.onopen = null;
      dataChannel.onmessage = null;
      dataChannel.onclosing = null;
      dataChannel.onclose = null;
      dataChannel.onerror = null;
      try {
        dataChannel.close();
      } catch {
        // Closing is best effort and idempotent.
      }
    }

    if (peerConnection !== null) {
      peerConnection.ondatachannel = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.onicecandidateerror = null;
      try {
        peerConnection.close();
      } catch {
        // Closing is best effort and idempotent.
      }
    }

    this.peerConnection = null;
    this.dataChannel = null;
    this.role = "none";
    this.connectionVersion += 1;
    this.state = notifyClose ? "closed" : "idle";

    if (notifyClose && (peerConnection !== null || dataChannel !== null)) {
      this.NotifyClosed(connectionVersion, reason, null, closedRole);
    }
  }

  HandleSetupFailure(error, peerConnection, connectionVersion, operationMessage) {
    const normalizedError = NormalizeNetworkError(error, operationMessage);

    if (this.IsCurrentConnection(peerConnection, connectionVersion)) {
      this.EmitStatus("error", normalizedError.message, normalizedError);
      this.DisposeCurrentConnection("setupFailed", false);
      this.state = "error";
    }

    return normalizedError;
  }

  async CreateHostOfferCode() {
    let connectionContext;
    try {
      connectionContext = this.PreparePeer("host");
      const { peerConnection, connectionVersion } = connectionContext;
      this.EmitStatus("creatingOffer", "Creating LAN host offer.");

      const dataChannel = peerConnection.createDataChannel(dataChannelLabel, {
        ordered: true,
        protocol: "frontierdrop.v1",
      });
      this.BindDataChannel(dataChannel, connectionVersion);

      const offer = await peerConnection.createOffer();
      this.EnsureCurrentConnection(peerConnection, connectionVersion);
      await peerConnection.setLocalDescription(offer);
      this.EnsureCurrentConnection(peerConnection, connectionVersion);
      this.EmitStatus("gatheringIce", "Gathering LAN connection candidates.");
      await WaitForIceGatheringComplete(peerConnection, this.iceGatheringTimeoutMs);
      this.EnsureCurrentConnection(peerConnection, connectionVersion);

      const offerCode = EncodeSignalingCode(
        NormalizeDescription(peerConnection.localDescription, "offer"),
      );
      this.EmitStatus("offerReady", "Host offer code is ready.");
      return offerCode;
    } catch (error) {
      if (connectionContext !== undefined) {
        throw this.HandleSetupFailure(
          error,
          connectionContext.peerConnection,
          connectionContext.connectionVersion,
          "Could not create the host offer",
        );
      }

      const normalizedError = NormalizeNetworkError(error, "Could not create the host offer");
      this.EmitStatus("error", normalizedError.message, normalizedError);
      throw normalizedError;
    }
  }

  async CreateJoinAnswerCode(offerCode) {
    let offerDescription;
    try {
      offerDescription = DecodeSignalingCode(offerCode, "offer");
    } catch (error) {
      this.EmitStatus("error", error.message, error);
      throw error;
    }

    let connectionContext;
    try {
      connectionContext = this.PreparePeer("joiner");
      const { peerConnection, connectionVersion } = connectionContext;
      this.EmitStatus("acceptingOffer", "Accepting the host offer.");
      await peerConnection.setRemoteDescription(offerDescription);
      this.EnsureCurrentConnection(peerConnection, connectionVersion);

      this.EmitStatus("creatingAnswer", "Creating LAN join answer.");
      const answer = await peerConnection.createAnswer();
      this.EnsureCurrentConnection(peerConnection, connectionVersion);
      await peerConnection.setLocalDescription(answer);
      this.EnsureCurrentConnection(peerConnection, connectionVersion);
      this.EmitStatus("gatheringIce", "Gathering LAN connection candidates.");
      await WaitForIceGatheringComplete(peerConnection, this.iceGatheringTimeoutMs);
      this.EnsureCurrentConnection(peerConnection, connectionVersion);

      const answerCode = EncodeSignalingCode(
        NormalizeDescription(peerConnection.localDescription, "answer"),
      );
      this.EmitStatus("answerReady", "Join answer code is ready.");
      return answerCode;
    } catch (error) {
      if (connectionContext !== undefined) {
        throw this.HandleSetupFailure(
          error,
          connectionContext.peerConnection,
          connectionContext.connectionVersion,
          "Could not create the join answer",
        );
      }

      const normalizedError = NormalizeNetworkError(error, "Could not create the join answer");
      this.EmitStatus("error", normalizedError.message, normalizedError);
      throw normalizedError;
    }
  }

  async AcceptHostAnswerCode(answerCode) {
    let answerDescription;
    try {
      answerDescription = DecodeSignalingCode(answerCode, "answer");
    } catch (error) {
      this.EmitStatus("error", error.message, error);
      throw error;
    }

    const peerConnection = this.peerConnection;
    const connectionVersion = this.connectionVersion;
    if (this.role !== "host" || peerConnection === null) {
      const error = new NetworkStateError(
        "Create a host offer before accepting an answer code.",
        { code: "HOST_OFFER_REQUIRED" },
      );
      this.EmitStatus("error", error.message, error);
      throw error;
    }

    if (peerConnection.remoteDescription !== null) {
      const error = new NetworkStateError("The host has already accepted an answer.", {
        code: "ANSWER_ALREADY_ACCEPTED",
      });
      this.EmitStatus("error", error.message, error);
      throw error;
    }

    try {
      this.EmitStatus("acceptingAnswer", "Accepting the joiner's answer.");
      await peerConnection.setRemoteDescription(answerDescription);
      this.EnsureCurrentConnection(peerConnection, connectionVersion);
      this.EmitStatus("connecting", "Answer accepted; establishing the LAN channel.");
    } catch (error) {
      const normalizedError = NormalizeNetworkError(error, "Could not accept the join answer");
      if (this.IsCurrentConnection(peerConnection, connectionVersion)) {
        this.EmitStatus("error", normalizedError.message, normalizedError);
      }
      throw normalizedError;
    }
  }

  Send(payload) {
    if (!this.IsOpen()) {
      const error = new NetworkStateError("The LAN data channel is not open.", {
        code: "DATA_CHANNEL_NOT_OPEN",
      });
      this.EmitStatus("sendError", error.message, error);
      return false;
    }

    try {
      this.dataChannel.send(payload);
      return true;
    } catch (error) {
      const normalizedError = NormalizeNetworkError(error, "Could not send the network message", "SEND_FAILED");
      this.EmitStatus("sendError", normalizedError.message, normalizedError);
      return false;
    }
  }

  Close(reason = "localClose") {
    if (this.peerConnection === null && this.dataChannel === null) {
      return false;
    }

    this.DisposeCurrentConnection(reason, true);
    return true;
  }
}

export function CreateManualLanConnection(options = {}) {
  return new ManualLanConnection(options);
}

export default ManualLanConnection;
