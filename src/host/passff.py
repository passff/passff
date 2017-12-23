#!/usr/bin/env python3

"""
    Host application of the browser extension PassFF
    that wraps around the zx2c4 pass script.
"""

import os, sys, json, struct, subprocess

def getMessage():
    """ Read a message from stdin and decode it. """
    rawLength = sys.stdin.buffer.read(4)
    if len(rawLength) == 0:
        sys.exit(0)
    messageLength = struct.unpack('@I', rawLength)[0]
    message = sys.stdin.buffer.read(messageLength).decode("utf-8")
    return json.loads(message)

def encodeMessage(messageContent):
    """ Encode a message for transmission, given its content. """
    encodedContent = json.dumps(messageContent)
    encodedLength = struct.pack('@I', len(encodedContent))
    return {'length': encodedLength, 'content': encodedContent}

def sendMessage(encodedMessage):
    """ Send an encoded message to stdout. """
    sys.stdout.buffer.write(encodedMessage['length'])
    sys.stdout.write(encodedMessage['content'])
    sys.stdout.flush()

if __name__ == "__main__":
    # Read message from standard input
    receivedMessage = getMessage()

    # Make sure we don't allow foreign code execution
    if receivedMessage['command'][-4:] != "pass":
        sys.exit(1)

    # Set up (modified) command environment
    env = dict(os.environ)
    if "HOME" not in env:
        env["HOME"] = os.path.expanduser('~')
    for key, val in receivedMessage['environment'].items():
        env[key] = val

    # Set up subprocess params
    cmd = [receivedMessage['command']] + receivedMessage['arguments']
    proc_params = {
        'stdout': subprocess.PIPE,
        'stderr': subprocess.PIPE,
        'env': env
    }
    if 'stdin' in receivedMessage:
      proc_params['stdin'] = subprocess.PIPE

    # Run and communicate with pass script
    proc = subprocess.Popen(cmd, **proc_params)
    if 'stdin' in receivedMessage:
      proc_in = bytes(receivedMessage['stdin'], receivedMessage['charset'])
      proc_out, proc_err = proc.communicate(input=proc_in)
    else:
      proc_out, proc_err = proc.communicate()

    # Send response
    sendMessage(encodeMessage({
        "exitCode": proc.returncode,
        "stdout": proc_out.decode(receivedMessage['charset']),
        "stderr": proc_err.decode(receivedMessage['charset'])
    }))
