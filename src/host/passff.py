#!/usr/bin/env python3

import os, sys, json, struct, subprocess, re

# Read a message from stdin and decode it.
def getMessage():
    rawLength = sys.stdin.buffer.read(4)
    if len(rawLength) == 0:
        sys.exit(0)
    messageLength = struct.unpack('@I', rawLength)[0]
    message = sys.stdin.buffer.read(messageLength).decode("utf-8")
    return json.loads(message)

# Encode a message for transmission, given its content.
def encodeMessage(messageContent):
    encodedContent = json.dumps(messageContent)
    encodedLength = struct.pack('@I', len(encodedContent))
    return {'length': encodedLength, 'content': encodedContent}

# Send an encoded message to stdout.
def sendMessage(encodedMessage):
    sys.stdout.buffer.write(encodedMessage['length'])
    sys.stdout.write(encodedMessage['content'])
    sys.stdout.flush()

receivedMessage = getMessage()
env = dict(os.environ)
if "HOME" not in env:
    env["HOME"] = os.path.expanduser('~')

if receivedMessage['command'][-4:] == "pass":
    for key, val in receivedMessage['environment'].items():
        env[key] = val
    cmd = [receivedMessage['command']] + receivedMessage['arguments']
    proc_params = {
        'stdout': subprocess.PIPE,
        'stderr': subprocess.PIPE,
        'env': env
    }
    if 'stdin' in receivedMessage:
      proc_params['stdin'] = subprocess.PIPE
    proc = subprocess.Popen(cmd, **proc_params)
    if 'stdin' in receivedMessage:
      proc_in = bytes(receivedMessage['stdin'], receivedMessage['charset'])
      proc_out, proc_err = proc.communicate(input=proc_in)
    else:
      proc_out, proc_err = proc.communicate()
    sendMessage(encodeMessage({
        "exitCode": proc.returncode,
        "stdout": proc_out.decode(receivedMessage['charset']),
        "stderr": proc_err.decode(receivedMessage['charset']),
        "other": ""
    }))
elif receivedMessage['command'] == "env":
    sendMessage(encodeMessage(env))
