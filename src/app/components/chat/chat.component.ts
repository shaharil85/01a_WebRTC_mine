import { Element } from '@angular/compiler';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { DataService } from './service/data.service';
import { Message } from './types/message';

const mediaConstraints = {
  audio: true,
  video : { width: 420, height: 320 }
}
const offerOptions = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};
@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements AfterViewInit {

  @ViewChild('local_video') localVideo: ElementRef;
  @ViewChild('remote_video') remoteVideo: ElementRef;
  @ViewChild('remote_video2') remoteVideo2: ElementRef;

  private localStream:MediaStream;
  private peerConnection : RTCPeerConnection;
  
  constructor(private dataService: DataService) { }

  ngAfterViewInit(): void {
    this.addIncomingMessageHandler();
    this.requestMediaDevices();
  }
  async requestMediaDevices(): Promise<void>{
      this.pauseLocalVideo();
  }
  async startLocalVideo(){
    this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    //console.log('starting local stream');
    this.localStream.getTracks().forEach(track =>{
      track.enabled = true;
    });
    this.localVideo.nativeElement.srcObject = this.localStream;
  }
  pauseLocalVideo(): void{
    this.localStream.getTracks().forEach(track =>{
      track.enabled = false;
    });
    this.localVideo.nativeElement.srcObject = undefined;
  }

  async call(): Promise<void>{
    this.createPeerConnection();
    // Add the tracks from the local stream to the RTCPeerConnection
    this.localStream.getTracks().forEach(
      track => this.peerConnection.addTrack(track, this.localStream)
    );
    try {
        const offer: RTCSessionDescriptionInit = await this.peerConnection.createOffer(offerOptions);
        // Establish the offer as the local peer's current description.
        await this.peerConnection.setLocalDescription(offer);
        this.dataService.sendMessage({type: 'offer', data: offer});
    } 
    catch (err) {
      this.handleGetUserMediaError(err);
    }
  }
  createPeerConnection(){
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: 'stun:stun1.l.google.com:19302'
        }
      ]
    });
    this.peerConnection.onicecandidate = this.handleICECandidateEvent;
    this.peerConnection.oniceconnectionstatechange = this.handleICEConnectionStateChangeEvent;
    this.peerConnection.onsignalingstatechange = this.handleSignalingStateChangeEvent;
    this.peerConnection.ontrack = this.handleTrackEvent;
  }
  handleGetUserMediaError(e: Error): void{
    switch (e.name) {
      case 'NotFoundError':
        alert('Unable to open your call because no camera and/or microphone were found.');
        break;
      case 'SecurityError':
      case 'PermissionDeniedError':
        // Do nothing; this is the same as the user canceling the call.
        break;
      default:
        console.log(e);
        alert('Error opening your camera and/or microphone: ' + e.message);
        break;
    }
    this.closeVideoCall();
  }
  private closeVideoCall(): void {
    console.log('Closing call');

    if (this.peerConnection) {
      this.peerConnection.ontrack = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onsignalingstatechange = null;
      // Stop all transceivers on the connection
      this.peerConnection.getTransceivers().forEach(transceiver => {
        transceiver.stop();
      });
      // Close the peer connection
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
 /* ########################  EVENT HANDLER  ################################## */
 private handleICECandidateEvent = (event: RTCPeerConnectionIceEvent) => {
    console.log(event);
    if (event.candidate) {
      this.dataService.sendMessage({
        type: 'ice-candidate',
        data: event.candidate
      });
    }
  }
  private handleICEConnectionStateChangeEvent = (event: Event) => {
    console.log(event);
    switch (this.peerConnection.iceConnectionState) {
      case 'closed':
      case 'failed':
      case 'disconnected':
        this.closeVideoCall();
        break;
    }
  }
  private handleSignalingStateChangeEvent = (event: Event) => {
    console.log(event);
    switch (this.peerConnection.signalingState) {
      case 'closed':
        this.closeVideoCall();
        break;
    }
  }
  private handleTrackEvent = (event: RTCTrackEvent) => {
    console.log(event);
    this.remoteVideo.nativeElement.srcObject = event.streams[0];
    // console.log(event);
    // this.remoteVideo.nativeElement.srcObject = event.streams[1];
  }
  private addIncomingMessageHandler(): void{
    this.dataService.connect();
    // this.transactions$.subscribe();
    this.dataService.message$.subscribe(
      msg => {
        // console.log('Received message: ' + msg.type);
        switch (msg.type) {
          case 'offer':
            this.handleOfferMessage(msg.data);
            break;
          case 'answer':
            this.handleAnswerMessage(msg.data);
            break;
          case 'hangup':
            this.handleHangupMessage(msg);
            break;
          case 'ice-candidate':
            this.handleICECandidateMessage(msg.data);
            break;
          default:
            console.log('unknown message of type ' + msg.type);
        }
      },
      error => console.log(error)
    );
  }
   /* ########################  MESSAGE HANDLER  ################################## */
  private handleOfferMessage(msg: RTCSessionDescriptionInit): void {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }
    if (!this.localStream) {
      this.startLocalVideo();
    }
    this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg))
      .then(() => {
        // add media stream to local video
        this.localVideo.nativeElement.srcObject = this.localStream;
        // add media tracks to remote connection
        this.localStream.getTracks().forEach(
          track => this.peerConnection.addTrack(track, this.localStream)
        );
      }).then(() => {
      // Build SDP for answer message
      return this.peerConnection.createAnswer();
    }).then((answer) => {
      // Set local SDP
      return this.peerConnection.setLocalDescription(answer);
    }).then(() => {
      // Send local SDP to remote party
      this.dataService.sendMessage({type: 'answer', data: this.peerConnection.localDescription});
    }).catch(this.handleGetUserMediaError);
  }
  private handleAnswerMessage(msg: RTCSessionDescriptionInit): void {
    this.peerConnection.setRemoteDescription(msg);
  }
  private handleHangupMessage(msg: Message): void {
    this.closeVideoCall();
  }
  private handleICECandidateMessage(msg: RTCIceCandidate): void {
    const candidate = new RTCIceCandidate(msg);
    this.peerConnection.addIceCandidate(candidate).catch(this.reportError);
  }
  private reportError = (e: Error) => {
    console.log('got Error: ' + e.name);
    console.log(e);
  }
  hangUp(): void {
    this.dataService.sendMessage({type: 'hangup', data: ''});
    this.closeVideoCall();
  }
}
