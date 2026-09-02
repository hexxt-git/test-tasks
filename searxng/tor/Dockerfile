FROM alpine:3.21
RUN apk add --no-cache tor
COPY torrc /etc/tor/torrc
USER tor
EXPOSE 9050 9051 9052 9053 9054
ENTRYPOINT ["tor", "-f", "/etc/tor/torrc"]
