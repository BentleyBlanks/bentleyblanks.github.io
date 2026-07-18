import assert from "node:assert/strict";

import {
  DecodeSignalingCode,
  EncodeSignalingCode,
  ManualLanConnection,
  SignalingCodeError,
  TryDecodeSignalingCode,
  signalingCodePrefix,
} from "./Script_Network.mjs";

const offerDescription = {
  type: "offer",
  sdp: "v=0\r\no=FrontierDrop 1 1 IN IP4 127.0.0.1\r\ns=Frontier Drop LAN 测试\r\n",
};
const answerDescription = {
  type: "answer",
  sdp: "v=0\r\no=FrontierDrop 2 1 IN IP4 127.0.0.1\r\ns=Answer\r\n",
};

const offerCode = EncodeSignalingCode(offerDescription);
assert.ok(offerCode.startsWith(signalingCodePrefix));
assert.match(offerCode.slice(signalingCodePrefix.length), /^[A-Za-z0-9_-]+$/u);
assert.deepEqual(DecodeSignalingCode(offerCode, "offer"), offerDescription);
assert.deepEqual(DecodeSignalingCode(`  ${offerCode}\n`, "offer"), offerDescription);

const answerCode = EncodeSignalingCode(answerDescription);
assert.deepEqual(DecodeSignalingCode(answerCode, "answer"), answerDescription);
assert.throws(
  () => DecodeSignalingCode(answerCode, "offer"),
  (error) => error instanceof SignalingCodeError && error.code === "UNEXPECTED_SIGNALING_TYPE",
);

for (const invalidCode of [
  "",
  "not-a-frontier-drop-code",
  `${signalingCodePrefix}%%%`,
  `${signalingCodePrefix}e30`,
  `${signalingCodePrefix}A`,
]) {
  assert.throws(() => DecodeSignalingCode(invalidCode), SignalingCodeError);
  const result = TryDecodeSignalingCode(invalidCode);
  assert.equal(result.ok, false);
  assert.ok(result.error instanceof SignalingCodeError);
}

const successfulResult = TryDecodeSignalingCode(offerCode, "offer");
assert.equal(successfulResult.ok, true);
assert.deepEqual(successfulResult.description, offerDescription);

// Constructing the wrapper must not require browser WebRTC globals.
const connection = new ManualLanConnection();
assert.equal(connection.GetState().state, "idle");
assert.equal(connection.IsOpen(), false);

class FakeDataChannel {
  constructor(label, options) {
    this.label = label;
    this.options = options;
    this.readyState = "connecting";
  }

  send() {}

  close() {
    this.readyState = "closed";
  }
}

class FakePeerConnection {
  static lastDataChannel = null;

  constructor(configuration) {
    this.configuration = configuration;
    this.iceGatheringState = "complete";
    this.iceConnectionState = "new";
    this.connectionState = "new";
    this.signalingState = "stable";
    this.localDescription = null;
    this.remoteDescription = null;
  }

  addEventListener() {}

  removeEventListener() {}

  createDataChannel(label, options) {
    const dataChannel = new FakeDataChannel(label, options);
    FakePeerConnection.lastDataChannel = dataChannel;
    return dataChannel;
  }

  async createOffer() {
    return { type: "offer", sdp: "v=0\r\ns=Fake Host Offer\r\n" };
  }

  async createAnswer() {
    return { type: "answer", sdp: "v=0\r\ns=Fake Join Answer\r\n" };
  }

  async setLocalDescription(description) {
    this.localDescription = description;
  }

  async setRemoteDescription(description) {
    this.remoteDescription = description;
  }

  close() {
    this.connectionState = "closed";
    this.signalingState = "closed";
  }
}

const hostConnection = new ManualLanConnection({
  peerConnectionConstructor: FakePeerConnection,
});
const generatedOfferCode = await hostConnection.CreateHostOfferCode();
assert.equal(DecodeSignalingCode(generatedOfferCode).type, "offer");
assert.equal(FakePeerConnection.lastDataChannel.options.ordered, true);
assert.equal("maxRetransmits" in FakePeerConnection.lastDataChannel.options, false);
assert.equal("maxPacketLifeTime" in FakePeerConnection.lastDataChannel.options, false);

const joinConnection = new ManualLanConnection({
  peerConnectionConstructor: FakePeerConnection,
});
const generatedAnswerCode = await joinConnection.CreateJoinAnswerCode(generatedOfferCode);
assert.equal(DecodeSignalingCode(generatedAnswerCode).type, "answer");
await hostConnection.AcceptHostAnswerCode(generatedAnswerCode);
assert.equal(hostConnection.GetPeerConnection().remoteDescription.type, "answer");
assert.equal(hostConnection.Close(), true);
assert.equal(hostConnection.Close(), false);
joinConnection.Close();

console.log("FrontierDrop network smoke tests passed.");
