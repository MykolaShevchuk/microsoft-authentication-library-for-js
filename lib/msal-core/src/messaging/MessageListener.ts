/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { window_type, MessageHelper } from "./MessageHelper";
import { WindowUtils } from "./../utils/WindowUtils";
import { message_type, message_content, MESSAGE_SCHEMA } from "./MessageHelper";
import { MessageCache } from "./MessageCache";
import { MessageDispatcher } from "./MessageDispatcher";

import { Logger } from "./../Logger";

export class MessageListener {

    private messageCache: MessageCache;
    private logger: Logger;

    /**
     * initialize the message listener, and register the callback to process messages
     */
    constructor(messageCache: MessageCache, logger: Logger) {
        this.messageCache = messageCache;
        this.logger = logger;
        // listen to all incoming messages
        window.addEventListener("message", this.receiveMessage, false);
    }

    /**
     * Parses the messages receieved
     * This will be a unique handler per message, we will allow only one active request at a time
     * @param event
     */
    private receiveMessage(event: any) {

        const windowType = MessageHelper.currentWindow();
        const receivedMessage: MESSAGE_SCHEMA = { ...event.data};

        switch(windowType) {

            // Top framed application: handles the delegation on behalf of the iframed app
            case window_type.TOP_FRAME: {

                switch(receivedMessage.type) {
                    case message_type.REDIRECT_REQUEST: {
                        // acknowlege the redirect on behalf of the iframed app by sending the current location
                        const message = MessageHelper.buildMessage(message_type.URL, message_content.URL_TOP_FRAME, window.location.href);
                        MessageDispatcher.dispatchMessage(event.source, message);
                        break;
                    }

                    case message_type.URL: {
                        // if the response is the URL to navigate for token acquisition, navigate to STS
                        if (receivedMessage.content === message_content.URL_NAVIGATE) {
                            this.logger.info("navigating to the Service on behalf of the iframed app");
                            WindowUtils.navigateWindow(receivedMessage.data, this.logger);
                        }
                        break;
                    }
                }
            }

            // embedded (in an iframe) application
            case window_type.IFRAME: {

                // check the origin, should match window.top always; message channel may be more secure
                if (window.top != event.source) {
                    this.logger.warning("The message origin is not verified");
                    return;
                }

                if (receivedMessage.content === message_content.URL_TOP_FRAME) {
                    // record the ack from the top frame - store the URL
                    this.messageCache.write(message_content.URL_TOP_FRAME, receivedMessage.data);

                    // respond with the URL to navigate for token acquisition
                    const urlNavigate = this.messageCache.read(message_content.URL_NAVIGATE);
                    const message = MessageHelper.buildMessage(message_type.URL, message_content.URL_NAVIGATE, urlNavigate);
                    MessageDispatcher.dispatchMessage(event.source, message);
                }

                break;
            }
        }
    }
}